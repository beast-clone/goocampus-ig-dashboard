"use client";
import { useEffect, useState } from "react";
import { IconSpeakerphone, IconTable, IconPlus, IconCheck, IconAlertTriangle } from "@tabler/icons-react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { WhatsAppSend } from "@/components/WhatsAppSend";

type Campaign = { id: string; name: string; spreadsheetId: string; tab: string; createdAt: string };
type Setup = { sheetsReady: boolean; serviceAccount: string };
type Resp = { setup: Setup; campaigns: Campaign[]; error?: string };

export default function CampaignsPage() {
  return (
    <PreviewDashboardShell
      active="campaigns"
      title="Marketing Campaigns"
      subtitle="Event lead lists that live in a sheet — imported here, worked here, and written back so everyone else still sees the status."
      hideAccountPicker
      hideRange
    >
      {() => <Campaigns />}
    </PreviewDashboardShell>
  );
}

function Campaigns() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    const blank: Resp = { setup: { sheetsReady: false, serviceAccount: "" }, campaigns: [] };
    fetch("/api/campaigns", { credentials: "same-origin" })
      .then((r) => r.json())
      // Any unexpected shape — an error payload, a 502 — falls back to the setup
      // card. Reading .length off whatever arrived crashed the page instead of
      // telling anyone what was wrong.
      .then((d) => setData({
        setup: { ...blank.setup, ...(d?.setup || {}) },
        campaigns: Array.isArray(d?.campaigns) ? d.campaigns : [],
      }))
      .catch(() => setData(blank));
  }, []);

  if (!data) return <Card><div className="px-5 py-8 text-[13px] text-[#8A92A6]">Loading campaigns…</div></Card>;

  const ready = data.setup?.sheetsReady;

  return (
    <div className="space-y-4">
      {!ready && <SetupNeeded setup={data.setup} />}

      <Card>
        <Head icon={<IconSpeakerphone size={18} stroke={1.8} />} title="Campaigns"
          meta={<button disabled={!ready}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium bg-brand text-white rounded-lg px-3.5 py-1.5 hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed"
            title={ready ? "Import a lead list" : "Finish the setup above first"}>
            <IconPlus size={15} stroke={2} /> Add campaign
          </button>}
        />
        {data.campaigns.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div className="text-[14px] text-[#232D42] mb-1">No campaigns yet</div>
            <div className="text-[12.5px] text-[#8A92A6] max-w-[52ch] mx-auto">
              A campaign points at one event&apos;s sheet — Gulbarga, Bijapur. The leads stay in that sheet:
              they are read when you open this tab and written straight back when you change a status or add
              a note, so the sheet remains correct for everyone who does not use the dashboard.
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {data.campaigns.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                <span className="w-8 h-8 rounded-lg bg-brand-light text-brand grid place-items-center shrink-0">
                  <IconTable size={16} stroke={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium text-[#232D42] truncate">{c.name}</span>
                  <span className="block text-[11.5px] text-[#8A92A6]">
                    Sheet tab <span className="font-mono">{c.tab}</span> · read live, nothing stored here
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <WhatsAppReady />
    </div>
  );
}

// Says exactly which of the three setup steps is outstanding, with the values
// needed to do them. A page that just says "not configured" makes someone come
// and ask which part.
function SetupNeeded({ setup }: { setup: Setup }) {
  const steps = [
    {
      done: setup.sheetsReady,
      title: "Turn on the Google Sheets API",
      body: <>On Google Cloud project <span className="font-mono text-[11.5px]">227161816049</span> — the same project the dashboard already uses for Analytics and Search Console. It&apos;s off today, so every sheet request is refused. I tried turning it on with the dashboard&apos;s own credentials and Google refused: a service account may use an API but not enable one. It needs a person in the Cloud Console.</>,
    },
    {
      done: false,
      title: "Share the sheet with the dashboard",
      body: <>Open the event sheet → Share → add <code className="text-[11.5px] bg-white border border-gray-200 rounded px-1.5 py-[1px] break-all">{setup.serviceAccount || "the service account"}</code> as an <b>Editor</b>. Editor, not Viewer — status has to be written back. It won&apos;t send an email; that&apos;s normal for a service account.</>,
    },
  ];

  return (
    <div className="rounded-2xl border border-[#F0DFB8] bg-[#FDF6E7] overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-[#F0DFB8]">
        <IconAlertTriangle size={17} stroke={1.9} className="text-[#B7791F]" />
        <h2 className="text-[14px] font-medium text-[#7A5410]">Two things needed before leads can be imported</h2>
      </div>
      <ol className="divide-y divide-[#F0DFB8]">
        {steps.map((s, i) => (
          <li key={s.title} className="flex items-start gap-3 px-5 py-3">
            <span className={`w-5 h-5 rounded-full grid place-items-center text-[11px] font-semibold shrink-0 mt-[1px] ${
              s.done ? "bg-[#2F9E6F] text-white" : "bg-white text-[#B7791F] border border-[#E0CB94]"}`}>
              {s.done ? <IconCheck size={12} stroke={3} /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-[#7A5410]">
                {s.title} {s.done && <span className="font-normal text-[#2F9E6F]">· done</span>}
              </span>
              <span className="block text-[12.5px] text-[#7A5410]/85 leading-relaxed mt-0.5">{s.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// WhatsApp needs none of the above, so it is shown working rather than described.
function WhatsAppReady() {
  return (
    <Card>
      <Head icon={<IconCheck size={18} stroke={2} />} title="WhatsApp is already working"
        meta={<span className="text-[11px] font-medium bg-[#E8F6F0] text-[#2F9E6F] px-2.5 py-1 rounded-full">No setup needed</span>} />
      <div className="px-5 py-4 flex flex-col gap-3">
        <p className="text-[13px] text-[#4A5468] max-w-[74ch] leading-relaxed">
          Every lead here will carry this button. It opens WhatsApp with the message already written and
          sends from whichever number that device is signed into — nothing goes out until a person presses
          send. Try it; this one points at a test number.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <WhatsAppSend phone="+919000000000" name="Ananya" />
          <span className="text-[12px] text-[#A6ACBE]">← a valid-looking number</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <WhatsAppSend phone="+912071234567" name="Test" />
          <span className="text-[12px] text-[#A6ACBE]">← a foreign number with +91 wrongly added, which the CRM does. It warns before you can send.</span>
        </div>
        <p className="text-[12px] text-[#8A92A6]">
          The wording lives in one file and is a one-line change — say what you&apos;d rather it said.
        </p>
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">{children}</section>;
}
function Head({ icon, title, meta }: { icon: React.ReactNode; title: string; meta?: React.ReactNode }) {
  return (
    <header className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
      <span className="text-brand shrink-0">{icon}</span>
      <h2 className="text-[14px] font-medium text-[#232D42]">{title}</h2>
      {meta && <div className="ml-auto">{meta}</div>}
    </header>
  );
}
