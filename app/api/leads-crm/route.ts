import { NextResponse } from "next/server";
import { safeError } from "@/lib/errors";
import {
  airtableList,
  dateRangeFormula,
  pickName,
  pickNumber,
  CRM_TABLE,
  CONTRACT_TABLE,
  REVENUE_TABLE,
  PERFORMANCE_TABLE,
  SALES_SYSTEM_TABLE,
  ATTENDANCE_TABLE,
  DISTRIBUTION_TABLE,
  OFFICE_TABLE,
} from "@/lib/sales-hub";

// GET /api/leads-crm?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Read-only aggregation of the Sales Hub base for a date range.
// Cached 12h per {from|to}.
//
// Sections returned:
//   - Range totals (leads, first-touch avg, contracts, revenue)
//   - Inflow, source split, interest mix, status snapshot
//   - Counsellor cards (assigned, first-activity, contracts, revenue)
//   - Campaign attribution
//   - Awaiting activity
//   - Call activity (Performance Metrics) — per counsellor
//   - Meetings (Sales System v2.0) — count, avg rating, upcoming
//   - Attendance × Distribution — days present, leads allocated
//   - Re-enquiries — repeat inquirers within range
//   - Walk-in enquiries (Office Enquiries)
//   - Revenue trend — last 6 months (independent of selected range)
//   - Geography — top locations

type Counsellor = {
  name: string;
  assigned: number;
  firstActivityAvgHrs: number | null;
  contracts: number;
  revenue: number;
};

type CallStat = {
  name: string;
  inboundCalls: number;
  outboundCalls: number;
  totalCallMins: number;
  connectedCalls: number;
  workingMins: number;
};

type MeetingSummary = {
  totalMeetings: number;
  avgRating: number | null;
  ratingDistribution: { rating: number; count: number }[];
  perCounsellor: { name: string; meetings: number; avgRating: number | null }[];
  upcoming: { name: string; counsellor: string; when: string }[];
};

type AttendanceRow = {
  name: string;
  daysPresent: number;
  daysAbsent: number;
  daysLeave: number;
  totalDays: number;
  leadsAllocated: number;
  dmLeadsAllocated: number;
};

type Payload = {
  range: { from: string; to: string; days: number };
  totals: {
    leads: number;
    firstActivityAvgHrs: number | null;
    contracts: number;
    revenue: number;
  };
  inflowByDay: { date: string; count: number }[];
  bySource: { name: string; count: number }[];
  byInterest: { name: string; count: number }[];
  byStatus: { name: string; count: number }[];
  counsellors: Counsellor[];
  campaigns: { name: string; leads: number; contracts: number; revenue: number }[];
  awaiting: { name: string; counsellor: string; source: string; daysUntouched: number }[];
  awaitingTotal: number;
  // New sections
  callActivity: CallStat[];
  meetings: MeetingSummary;
  attendance: AttendanceRow[];
  reEnquiries: {
    total: number;
    withinRange: number;
    recent: { name: string; counsellor: string; lastReEnquiryAt: string }[];
  };
  walkIns: {
    total: number;
    byCountry: { name: string; count: number }[];
    byInterest: { name: string; count: number }[];
    recent: { name: string; createdAt: string; country: string; interest: string }[];
  };
  revenueTrend: { month: string; revenue: number; contracts: number }[];
  geography: { name: string; count: number }[];
  generatedAt: string;
  latencyMs: number;
  cached?: boolean;
  cachedAt?: string;
};

type Cached = { at: number; payload: Payload };
const CACHE = new Map<string, Cached>();
const TTL_MS = 24 * 60 * 60 * 1000; // once/day — Airtable is heavy; sales data refreshed daily

const CRM_FIELDS = [
  "Full Name",
  "Created Date",
  "Actual Last Modified",
  "Counsellor",
  "Lead Source (n8n)",
  "Lead Status",
  "Primary Interest (n8n)",
  "Campaign Name",
  "Days Untouched",
  "Re-Enquiry",
  "Last Re-Enquiry",
  "Location (n8n)",
];

const CONTRACT_FIELDS = ["Generated Date", "Counsellor", "Client's Name"];
const REVENUE_FIELDS = ["Payment Date", "Revenue", "Owner"];
const PERF_FIELDS = [
  "Date",
  "Counsellor",
  "Inbound → No. of Calls",
  "Outbound → No. of Calls",
  "Inbound → Call Duration (in mins)",
  "Outbound → Call Duration (in mins)",
  "Total Working Duration (in mins)",
  "Total Connected Calls",
];
const SALES_SYS_FIELDS = [
  "Particulars",
  "Meeting Date & Time",
  "Assigned Counsellor",
  "Lead Rating by Counsellor",
  "Status",
];
const ATTEND_FIELDS = ["Date", "Attendance", "Assigned User", "Name"];
const DIST_FIELDS = ["Date", "Counsellor", "DM Leads Count", "Total Leads Count"];
const OFFICE_FIELDS = [
  "Client's Name",
  "Created Time",
  "Which of the following countries are you interested to study/work in?",
  "Which of the following specialties are you interested in?",
  "What's your current MBBS status?",
];

function bumpMap(map: Map<string, number>, key: string, by = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + by);
}

function topN<T>(entries: T[], n: number, getCount: (t: T) => number): T[] {
  return [...entries].sort((a, b) => getCount(b) - getCount(a)).slice(0, n);
}

// Last 6 months window for revenue trend — independent of the user's selected range.
function last6MonthsWindow() {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth() - 5, 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const force = url.searchParams.get("force") === "1";
  if (!from || !to) return NextResponse.json({ error: "from and to required" }, { status: 400 });

  const cacheKey = `v2|${from}|${to}`;
  const now = Date.now();
  const cached = CACHE.get(cacheKey);
  if (!force && cached && now - cached.at < TTL_MS) {
    return NextResponse.json({ ...cached.payload, cached: true, cachedAt: new Date(cached.at).toISOString() });
  }

  const t0 = Date.now();
  try {
    const revWindow = last6MonthsWindow();

    // Fetch everything in parallel. Each is date-scoped so no full-table scans.
    const [leads, contracts, revenue, perf, meetings, attendance, distribution, walkIns, revenueWide, contractsWide] =
      await Promise.all([
        airtableList<Record<string, unknown>>(CRM_TABLE, {
          filterByFormula: dateRangeFormula("Created Date", from, to),
          fields: CRM_FIELDS,
          pageSize: 100,
          maxRecords: 20_000,
        }),
        airtableList<Record<string, unknown>>(CONTRACT_TABLE, {
          filterByFormula: dateRangeFormula("Generated Date", from, to),
          fields: CONTRACT_FIELDS,
          pageSize: 100,
          maxRecords: 5_000,
        }),
        airtableList<Record<string, unknown>>(REVENUE_TABLE, {
          filterByFormula: dateRangeFormula("Payment Date", from, to),
          fields: REVENUE_FIELDS,
          pageSize: 100,
          maxRecords: 5_000,
        }),
        airtableList<Record<string, unknown>>(PERFORMANCE_TABLE, {
          filterByFormula: dateRangeFormula("Date", from, to),
          fields: PERF_FIELDS,
          pageSize: 100,
          maxRecords: 5_000,
        }),
        airtableList<Record<string, unknown>>(SALES_SYSTEM_TABLE, {
          filterByFormula: dateRangeFormula("Meeting Date & Time", from, to),
          fields: SALES_SYS_FIELDS,
          pageSize: 100,
          maxRecords: 5_000,
        }),
        airtableList<Record<string, unknown>>(ATTENDANCE_TABLE, {
          filterByFormula: dateRangeFormula("Date", from, to),
          fields: ATTEND_FIELDS,
          pageSize: 100,
          maxRecords: 5_000,
        }),
        airtableList<Record<string, unknown>>(DISTRIBUTION_TABLE, {
          filterByFormula: dateRangeFormula("Date", from, to),
          fields: DIST_FIELDS,
          pageSize: 100,
          maxRecords: 5_000,
        }),
        airtableList<Record<string, unknown>>(OFFICE_TABLE, {
          filterByFormula: dateRangeFormula("Created Time", from, to),
          fields: OFFICE_FIELDS,
          pageSize: 100,
          maxRecords: 5_000,
        }),
        // Wide-window revenue for the trend chart.
        airtableList<Record<string, unknown>>(REVENUE_TABLE, {
          filterByFormula: dateRangeFormula("Payment Date", revWindow.from, revWindow.to),
          fields: REVENUE_FIELDS,
          pageSize: 100,
          maxRecords: 10_000,
        }),
        airtableList<Record<string, unknown>>(CONTRACT_TABLE, {
          filterByFormula: dateRangeFormula("Generated Date", revWindow.from, revWindow.to),
          fields: CONTRACT_FIELDS,
          pageSize: 100,
          maxRecords: 10_000,
        }),
      ]);

    // -------------- Core aggregations (unchanged) --------------
    const inflowMap = new Map<string, number>();
    const sourceMap = new Map<string, number>();
    const interestMap = new Map<string, number>();
    const statusMap = new Map<string, number>();
    const locationMap = new Map<string, number>();
    const counsellorMap = new Map<string, Counsellor>();
    const campaignMap = new Map<string, { name: string; leads: number; contracts: number; revenue: number }>();
    const perCounsellorMs = new Map<string, { sum: number; n: number }>();
    let firstActivityMs = 0;
    let firstActivityCount = 0;

    const awaitingRaw: { name: string; counsellor: string; source: string; daysUntouched: number }[] = [];
    const reEnquiriesWithin: { name: string; counsellor: string; lastReEnquiryAt: string }[] = [];
    let reEnquiryTotal = 0;

    for (const rec of leads) {
      const f = rec.fields;
      const createdIso = pickName(f["Created Date"]);
      const modifiedIso = pickName(f["Actual Last Modified"]);
      const counsellor = pickName(f["Counsellor"]) || "Unassigned";
      const source = pickName(f["Lead Source (n8n)"]) || "Unattributed";
      const status = pickName(f["Lead Status"]) || "—";
      const interest = pickName(f["Primary Interest (n8n)"]) || "—";
      const campaign = pickName(f["Campaign Name"]);
      const location = pickName(f["Location (n8n)"]);
      const daysUntouched = pickNumber(f["Days Untouched"]);
      const fullName = pickName(f["Full Name"]);
      const isReEnquiry = f["Re-Enquiry"] === true;
      const lastReEnquiryAt = pickName(f["Last Re-Enquiry"]);

      if (createdIso) bumpMap(inflowMap, createdIso.slice(0, 10));
      bumpMap(sourceMap, source);
      bumpMap(interestMap, interest);
      bumpMap(statusMap, status);
      if (location) bumpMap(locationMap, location);

      let c = counsellorMap.get(counsellor);
      if (!c) {
        c = { name: counsellor, assigned: 0, firstActivityAvgHrs: null, contracts: 0, revenue: 0 };
        counsellorMap.set(counsellor, c);
      }
      c.assigned += 1;

      if (createdIso && modifiedIso) {
        const diffMs = new Date(modifiedIso).getTime() - new Date(createdIso).getTime();
        if (diffMs > 0) {
          firstActivityMs += diffMs;
          firstActivityCount += 1;
          const p = perCounsellorMs.get(counsellor) || { sum: 0, n: 0 };
          p.sum += diffMs;
          p.n += 1;
          perCounsellorMs.set(counsellor, p);
        }
      }

      if (campaign) {
        let cam = campaignMap.get(campaign);
        if (!cam) {
          cam = { name: campaign, leads: 0, contracts: 0, revenue: 0 };
          campaignMap.set(campaign, cam);
        }
        cam.leads += 1;
      }

      if (daysUntouched > 7 && fullName) {
        awaitingRaw.push({ name: fullName, counsellor, source, daysUntouched: Math.round(daysUntouched) });
      }

      if (isReEnquiry) {
        reEnquiryTotal += 1;
        if (lastReEnquiryAt) {
          reEnquiriesWithin.push({ name: fullName, counsellor, lastReEnquiryAt });
        }
      }
    }

    let contractsTotal = 0;
    for (const rec of contracts) {
      contractsTotal += 1;
      const cName = pickName(rec.fields["Counsellor"]);
      if (cName) {
        const c = counsellorMap.get(cName);
        if (c) c.contracts += 1;
      }
    }

    let revenueTotal = 0;
    for (const rec of revenue) {
      const amount = pickNumber(rec.fields["Revenue"]);
      revenueTotal += amount;
      const owner = pickName(rec.fields["Owner"]);
      if (owner) {
        const c = counsellorMap.get(owner);
        if (c) c.revenue += amount;
      }
    }

    // -------------- Section: Call activity --------------
    const callMap = new Map<string, CallStat>();
    for (const rec of perf) {
      const f = rec.fields;
      const name = pickName(f["Counsellor"]) || "Unknown";
      let cs = callMap.get(name);
      if (!cs) {
        cs = { name, inboundCalls: 0, outboundCalls: 0, totalCallMins: 0, connectedCalls: 0, workingMins: 0 };
        callMap.set(name, cs);
      }
      cs.inboundCalls += pickNumber(f["Inbound → No. of Calls"]);
      cs.outboundCalls += pickNumber(f["Outbound → No. of Calls"]);
      cs.totalCallMins +=
        pickNumber(f["Inbound → Call Duration (in mins)"]) + pickNumber(f["Outbound → Call Duration (in mins)"]);
      cs.connectedCalls += pickNumber(f["Total Connected Calls"]);
      cs.workingMins += pickNumber(f["Total Working Duration (in mins)"]);
    }

    // -------------- Section: Meetings --------------
    const ratingMap = new Map<number, number>();
    const meetingsPerCounsellor = new Map<string, { meetings: number; ratingSum: number; ratingN: number }>();
    let ratingSum = 0;
    let ratingN = 0;
    const upcomingMeetings: { name: string; counsellor: string; when: string }[] = [];
    const nowIso = new Date().toISOString();
    for (const rec of meetings) {
      const f = rec.fields;
      const when = pickName(f["Meeting Date & Time"]);
      const rating = pickNumber(f["Lead Rating by Counsellor"]);
      const cName = pickName(f["Assigned Counsellor"]);
      const leadName = pickName(f["Particulars"]);
      if (rating > 0) {
        bumpMap(ratingMap, String(rating) as unknown as string);
        ratingSum += rating;
        ratingN += 1;
      }
      if (cName) {
        let p = meetingsPerCounsellor.get(cName);
        if (!p) {
          p = { meetings: 0, ratingSum: 0, ratingN: 0 };
          meetingsPerCounsellor.set(cName, p);
        }
        p.meetings += 1;
        if (rating > 0) {
          p.ratingSum += rating;
          p.ratingN += 1;
        }
      }
      if (when && when > nowIso) {
        upcomingMeetings.push({ name: leadName, counsellor: cName, when });
      }
    }
    upcomingMeetings.sort((a, b) => a.when.localeCompare(b.when));

    const meetingsSummary: MeetingSummary = {
      totalMeetings: meetings.length,
      avgRating: ratingN > 0 ? +(ratingSum / ratingN).toFixed(2) : null,
      ratingDistribution: [1, 2, 3, 4, 5].map((r) => ({ rating: r, count: (ratingMap.get(String(r) as unknown as string) as unknown as number) || 0 })),
      perCounsellor: [...meetingsPerCounsellor.entries()]
        .map(([name, p]) => ({
          name,
          meetings: p.meetings,
          avgRating: p.ratingN > 0 ? +(p.ratingSum / p.ratingN).toFixed(2) : null,
        }))
        .sort((a, b) => b.meetings - a.meetings),
      upcoming: upcomingMeetings.slice(0, 10),
    };

    // -------------- Section: Attendance × Distribution --------------
    // Build a per-counsellor tally of attendance days.
    const attMap = new Map<string, { daysPresent: number; daysAbsent: number; daysLeave: number; totalDays: number }>();
    for (const rec of attendance) {
      const f = rec.fields;
      // The Name field is usually the primary — attendance rows are per counsellor per day.
      const cName = pickName(f["Assigned User"]) || pickName(f["Name"]);
      const status = (pickName(f["Attendance"]) || "").toLowerCase();
      if (!cName) continue;
      let a = attMap.get(cName);
      if (!a) {
        a = { daysPresent: 0, daysAbsent: 0, daysLeave: 0, totalDays: 0 };
        attMap.set(cName, a);
      }
      a.totalDays += 1;
      if (status.includes("present")) a.daysPresent += 1;
      else if (status.includes("leave") || status.includes("off")) a.daysLeave += 1;
      else if (status.includes("absent")) a.daysAbsent += 1;
    }
    // Distribution counts.
    const distMap = new Map<string, { leads: number; dmLeads: number }>();
    for (const rec of distribution) {
      const f = rec.fields;
      const cName = pickName(f["Counsellor"]);
      if (!cName) continue;
      let d = distMap.get(cName);
      if (!d) {
        d = { leads: 0, dmLeads: 0 };
        distMap.set(cName, d);
      }
      d.leads += pickNumber(f["Total Leads Count"]);
      d.dmLeads += pickNumber(f["DM Leads Count"]);
    }
    const attendanceRows: AttendanceRow[] = [];
    const allNames = new Set([...attMap.keys(), ...distMap.keys()]);
    for (const name of allNames) {
      const a = attMap.get(name) || { daysPresent: 0, daysAbsent: 0, daysLeave: 0, totalDays: 0 };
      const d = distMap.get(name) || { leads: 0, dmLeads: 0 };
      attendanceRows.push({
        name,
        daysPresent: a.daysPresent,
        daysAbsent: a.daysAbsent,
        daysLeave: a.daysLeave,
        totalDays: a.totalDays,
        leadsAllocated: d.leads,
        dmLeadsAllocated: d.dmLeads,
      });
    }
    attendanceRows.sort((a, b) => b.leadsAllocated - a.leadsAllocated);

    // -------------- Section: Walk-in enquiries --------------
    const walkInCountryMap = new Map<string, number>();
    const walkInInterestMap = new Map<string, number>();
    const walkInRecent: { name: string; createdAt: string; country: string; interest: string }[] = [];
    for (const rec of walkIns) {
      const f = rec.fields;
      const name = pickName(f["Client's Name"]);
      const createdAt = pickName(f["Created Time"]);
      const country = pickName(f["Which of the following countries are you interested to study/work in?"]);
      const interest = pickName(f["Which of the following specialties are you interested in?"]);
      if (country) country.split(",").forEach((c) => bumpMap(walkInCountryMap, c.trim()));
      if (interest) interest.split(",").forEach((i) => bumpMap(walkInInterestMap, i.trim()));
      walkInRecent.push({ name, createdAt, country, interest });
    }
    walkInRecent.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    // -------------- Section: Revenue trend (last 6 months) --------------
    const revByMonth = new Map<string, { revenue: number; contracts: number }>();
    for (const rec of revenueWide) {
      const d = pickName(rec.fields["Payment Date"]);
      if (!d) continue;
      const key = d.slice(0, 7); // YYYY-MM
      let bucket = revByMonth.get(key);
      if (!bucket) {
        bucket = { revenue: 0, contracts: 0 };
        revByMonth.set(key, bucket);
      }
      bucket.revenue += pickNumber(rec.fields["Revenue"]);
    }
    for (const rec of contractsWide) {
      const d = pickName(rec.fields["Generated Date"]);
      if (!d) continue;
      const key = d.slice(0, 7);
      let bucket = revByMonth.get(key);
      if (!bucket) {
        bucket = { revenue: 0, contracts: 0 };
        revByMonth.set(key, bucket);
      }
      bucket.contracts += 1;
    }
    const revenueTrend = [...revByMonth.entries()]
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // -------------- Finalize counsellor per-person first-activity avg --------------
    const counsellors = [...counsellorMap.values()].sort((a, b) => b.assigned - a.assigned);
    for (const c of counsellors) {
      const p = perCounsellorMs.get(c.name);
      if (p && p.n > 0) c.firstActivityAvgHrs = +(p.sum / p.n / 3_600_000).toFixed(1);
    }

    // -------------- Shape output --------------
    const inflowByDay = [...inflowMap.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const bySource = [...sourceMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    const byInterest = [...interestMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    const byStatus = [...statusMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    const geography = [...locationMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 15);
    const campaigns = topN([...campaignMap.values()], 10, (c) => c.leads);
    const awaiting = [...awaitingRaw].sort((a, b) => b.daysUntouched - a.daysUntouched).slice(0, 20);

    reEnquiriesWithin.sort((a, b) => (a.lastReEnquiryAt < b.lastReEnquiryAt ? 1 : -1));

    const firstActivityAvgHrs =
      firstActivityCount > 0 ? +(firstActivityMs / firstActivityCount / 3_600_000).toFixed(1) : null;
    const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1);

    const payload: Payload = {
      range: { from, to, days },
      totals: {
        leads: leads.length,
        firstActivityAvgHrs,
        contracts: contractsTotal,
        revenue: revenueTotal,
      },
      inflowByDay,
      bySource,
      byInterest,
      byStatus,
      counsellors,
      campaigns,
      awaiting,
      awaitingTotal: awaitingRaw.length,
      callActivity: [...callMap.values()].sort((a, b) => b.inboundCalls + b.outboundCalls - (a.inboundCalls + a.outboundCalls)),
      meetings: meetingsSummary,
      attendance: attendanceRows,
      reEnquiries: {
        total: reEnquiryTotal,
        withinRange: reEnquiriesWithin.length,
        recent: reEnquiriesWithin.slice(0, 15),
      },
      walkIns: {
        total: walkIns.length,
        byCountry: [...walkInCountryMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10),
        byInterest: [...walkInInterestMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10),
        recent: walkInRecent.slice(0, 15),
      },
      revenueTrend,
      geography,
      generatedAt: new Date().toISOString(),
      latencyMs: Date.now() - t0,
    };

    CACHE.set(cacheKey, { at: now, payload });
    return NextResponse.json({ ...payload, cached: false });
  } catch (err) {
    return NextResponse.json(safeError(err, "Sales Hub fetch failed"), { status: 502 });
  }
}
