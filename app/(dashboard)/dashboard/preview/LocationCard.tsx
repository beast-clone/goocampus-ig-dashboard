"use client";
import { useMemo, useState } from "react";
import { IconChevronDown, IconMapPin } from "@tabler/icons-react";

// Followers by State · City · Country (Nandu: "I want to see the state/town also",
// for Facebook and Instagram, every brand).
//
// Meta gives the TOP 45 CITIES only — no state breakdown. Each city comes labelled
// with its state ("Coimbatore, Tamil Nadu" on Instagram, "Indore, Madhya Pradesh, India"
// on Facebook), so states are the sum of their cities in that top-45 list. The card
// says how much of the audience that covers. Smaller towns aren't available from Meta.
type Entry = { label: string; value: number };

const IN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
  "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
  "West Bengal", "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi",
  "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];
const ALIASES: Record<string, string> = { "national capital territory of delhi": "Delhi", "new delhi": "Delhi", orissa: "Odisha", pondicherry: "Puducherry", "jammu & kashmir": "Jammu and Kashmir" };
const stateOf = (s: string) => {
  const k = s.trim().toLowerCase();
  return ALIASES[k] || IN_STATES.find((x) => x.toLowerCase() === k) || null;
};
const regionName = (() => {
  try { const dn = new Intl.DisplayNames(["en"], { type: "region" }); return (c: string) => (c.length === 2 ? dn.of(c.toUpperCase()) || c : c); }
  catch { return (c: string) => c; }
})();

// Instagram's "City, Region" has no country, and Pakistan also has a Punjab — its
// cities must not be counted under India's Punjab.
const PK_PUNJAB = new Set(["lahore", "faisalabad", "rawalpindi", "multan", "gujranwala", "sialkot", "bahawalpur", "sargodha", "sheikhupura",
  "rahim yar khan", "jhang", "gujrat", "sahiwal", "okara", "kasur", "dera ghazi khan", "chiniot", "kamoke", "mandi bahauddin", "jhelum",
  "sadiqabad", "khanewal", "hafizabad", "muzaffargarh", "khanpur", "attock", "wah cantonment", "mianwali", "islamabad"]);

// "City, State" (Instagram) or "City, State, Country" (Facebook) → parts.
function parseCity(label: string) {
  const parts = label.split(",").map((p) => p.trim()).filter(Boolean);
  const city = parts[0] || label;
  const country = parts.length >= 3 ? parts[parts.length - 1] : null;
  const region = parts.length >= 2 ? parts[1] : "";
  let state = (!country || /^india$/i.test(country)) ? stateOf(region) : null;
  if (state === "Punjab" && !country && PK_PUNJAB.has(city.toLowerCase())) state = null;
  return { city, region, state, country };
}

export function LocationCard({ cities, countries, totalFollowers, platform }: {
  cities: Entry[];              // top cities from Meta (label = "City, State[, Country]")
  countries: Entry[];           // label = ISO country code or name
  totalFollowers: number;       // for "covers X%" and shares
  platform: "Instagram" | "Facebook";
}) {
  const [view, setView] = useState<"state" | "city" | "country">("state");
  const [open, setOpen] = useState<string | null>(null);
  const cityTotal = cities.reduce((s, c) => s + c.value, 0);
  const coverPct = totalFollowers ? Math.round((cityTotal / totalFollowers) * 100) : null;

  const states = useMemo(() => {
    const m = new Map<string, { state: string; value: number; cities: { city: string; value: number }[] }>();
    for (const c of cities) {
      const p = parseCity(c.label);
      if (!p.state) continue;
      const e = m.get(p.state) || { state: p.state, value: 0, cities: [] };
      e.value += c.value; e.cities.push({ city: p.city, value: c.value });
      m.set(p.state, e);
    }
    return [...m.values()].sort((a, b) => b.value - a.value);
  }, [cities]);
  const inIndiaCities = states.reduce((s, x) => s + x.value, 0);

  const pct = (v: number) => (totalFollowers ? `${((v / totalFollowers) * 100).toFixed(1)}%` : "");
  const Bar = ({ v, max }: { v: number; max: number }) => (
    <div className="h-1.5 rounded-full bg-gray-100 mt-1"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(2, (v / Math.max(1, max)) * 100)}%` }} /></div>
  );

  return (
    <section className="bg-white border border-gray-100 rounded-xl">
      <div className="flex items-start gap-3 px-4 py-3 border-b border-gray-100 flex-wrap">
        <span className="w-8 h-8 rounded-lg bg-brand-light text-brand grid place-items-center flex-shrink-0"><IconMapPin size={17} stroke={1.8} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-medium text-[#232D42]">Where your followers are</div>
          <div className="text-[12px] text-[#8A92A6] mt-0.5">
            {platform} gives the top {cities.length} cities{coverPct != null ? <> — they cover <b className="font-medium">{cityTotal.toLocaleString("en-IN")}</b> of {totalFollowers.toLocaleString("en-IN")} followers ({coverPct}%)</> : null}.
            {" "}States are the sum of their cities in that list; smaller towns aren&apos;t shared by Meta.
          </div>
        </div>
        <div className="inline-flex bg-[#F6F7FB] border border-gray-100 rounded p-0.5 gap-0.5">
          {(["state", "city", "country"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`h-8 px-3 rounded text-[13px] font-medium ${view === v ? "bg-white text-brand border border-gray-100" : "text-[#8A92A6] hover:text-[#232D42]"}`}>
              {v === "state" ? "State" : v === "city" ? "City" : "Country"}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {view === "state" && (
          states.length === 0 ? <div className="text-[14px] text-[#8A92A6]">No Indian cities in {platform}&apos;s top-city list for this account.</div> : (
            <>
              <div className="text-[12px] text-[#8A92A6] mb-3">{states.length} states · {inIndiaCities.toLocaleString("en-IN")} followers in their top cities. Click a state to see its cities.</div>
              <ul className="divide-y divide-gray-50">
                {states.map((s) => (
                  <li key={s.state}>
                    <button onClick={() => setOpen(open === s.state ? null : s.state)} className="w-full text-left py-2">
                      <div className="flex items-baseline justify-between gap-2 text-[13px]">
                        <span className="text-[#232D42] inline-flex items-center gap-1.5">
                          <IconChevronDown size={14} stroke={2} className={`text-[#8A92A6] transition ${open === s.state ? "" : "-rotate-90"}`} />
                          {s.state} <span className="text-[#8A92A6]">· {s.cities.length} {s.cities.length === 1 ? "city" : "cities"}</span>
                        </span>
                        <span className="text-[#232D42] tabular-nums">{s.value.toLocaleString("en-IN")} <span className="text-[#8A92A6]">{pct(s.value)}</span></span>
                      </div>
                      <Bar v={s.value} max={states[0].value} />
                    </button>
                    {open === s.state && (
                      <ul className="ml-6 mb-2 rounded-lg bg-[#F6F7FB] px-3 py-1.5">
                        {[...s.cities].sort((a, b) => b.value - a.value).map((c) => (
                          <li key={c.city} className="flex items-baseline justify-between gap-2 text-[13px] py-1">
                            <span className="text-[#4A5468]">{c.city}</span>
                            <span className="tabular-nums text-[#4A5468]">{c.value.toLocaleString("en-IN")} <span className="text-[#8A92A6]">{pct(c.value)}</span></span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )
        )}

        {view === "city" && (
          cities.length === 0 ? <div className="text-[14px] text-[#8A92A6]">No city data from {platform} for this account.</div> : (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
              {cities.map((c) => {
                const p = parseCity(c.label);
                return (
                  <li key={c.label}>
                    <div className="flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="text-[#232D42] truncate">{p.city} <span className="text-[#8A92A6]">· {p.state || [p.region, p.country].filter(Boolean).join(", ")}</span></span>
                      <span className="text-[#232D42] tabular-nums whitespace-nowrap">{c.value.toLocaleString("en-IN")} <span className="text-[#8A92A6]">{pct(c.value)}</span></span>
                    </div>
                    <Bar v={c.value} max={cities[0].value} />
                  </li>
                );
              })}
            </ul>
          )
        )}

        {view === "country" && (
          countries.length === 0 ? <div className="text-[14px] text-[#8A92A6]">No country data from {platform} for this account.</div> : (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
              {countries.slice(0, 20).map((c) => (
                <li key={c.label}>
                  <div className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="text-[#232D42] truncate">{regionName(c.label)}</span>
                    <span className="text-[#232D42] tabular-nums whitespace-nowrap">{c.value.toLocaleString("en-IN")} <span className="text-[#8A92A6]">{pct(c.value)}</span></span>
                  </div>
                  <Bar v={c.value} max={countries[0].value} />
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </section>
  );
}
