"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { IconBrandInstagram, IconBrandFacebook, IconBrandLinkedin, IconBrandYoutube, IconCheck, IconUpload, IconLink, IconTrash, IconInfoCircle, type Icon } from "@tabler/icons-react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { LoadingBlock } from "@/components/LoadingBlock";
import { showToast } from "../Toast";

// Brands (docs/BRANDS_SPEC.md · prototype docs/brands-prototype/v1.html). Stage 1: every brand,
// its logo (upload one), and whether each of its four accounts is really connected; YouTube
// connects from here. Adding brands and connecting Meta / LinkedIn here is stage 2.

type Acc = { connected: boolean; name: string | null; page?: string | null; channel?: string | null };
type Brand = { id: string; name: string; handle: string; logo: string | null; logoUploaded: boolean; accounts: Record<PlatKey, Acc> };
type PlatKey = "instagram" | "facebook" | "linkedin" | "youtube";

const INK = "text-[#232D42]", MUTED = "text-[#8A92A6]";
const PLAT: Record<PlatKey, { n: string; c: string; I: Icon }> = {
  instagram: { n: "Instagram", c: "#C13584", I: IconBrandInstagram },
  facebook: { n: "Facebook", c: "#1877F2", I: IconBrandFacebook },
  linkedin: { n: "LinkedIn", c: "#0A66C2", I: IconBrandLinkedin },
  youtube: { n: "YouTube", c: "#FF0000", I: IconBrandYoutube },
};
const ORDER: PlatKey[] = ["instagram", "facebook", "linkedin", "youtube"];
const nOn = (b: Brand) => ORDER.filter((k) => b.accounts[k].connected).length;
const initials = (n: string) => n.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

export default function BrandsPage() {
  return (
    <PreviewDashboardShell active="brands" title="Brands" hideAccountPicker hideRange
      subtitle="Every brand the dashboard shows, its logo, and which of its accounts are connected.">
      {() => <Brands />}
    </PreviewDashboardShell>
  );
}

function Logo({ b, size }: { b: Brand; size: number }) {
  return (
    <span className="rounded-full shrink-0 grid place-items-center overflow-hidden bg-brand-light text-brand font-medium" style={{ width: size, height: size, fontSize: Math.round(size / 2.8) }}>
      {b.logo ? <img src={b.logo} alt="" className="w-full h-full object-cover" /> : initials(b.name)}
    </span>
  );
}

// Square, 256 px — small enough to store, sharp enough for the picker.
function toSquarePng(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = 256, c = document.createElement("canvas"); c.width = s; c.height = s;
      const ctx = c.getContext("2d")!; const m = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, s, s);
      URL.revokeObjectURL(img.src); resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("That file isn't an image."));
    img.src = URL.createObjectURL(file);
  });
}

function Brands() {
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string>("");
  const load = useCallback(() => {
    fetch("/api/brands", { cache: "no-store" }).then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setBrands(j.brands); setSel((s) => s || (j.brands as Brand[]).find((x) => nOn(x) < 4)?.id || j.brands[0]?.id || "");
    }).catch((e) => setErr((e as Error).message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const b = brands?.find((x) => x.id === sel);
  const saveLogo = async (logo: string | null) => {
    if (!b) return;
    const r = await fetch("/api/brands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, logo }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { showToast({ who: "Couldn't save the logo", body: j.error || "Try again.", av: "!" }); return; }
    showToast({ who: logo ? "Logo updated" : "Logo removed", body: `${b.name} — the brand picker shows it on the next page load.`, av: "✓" });
    load();
  };
  const pick = () => {
    const i = document.createElement("input"); i.type = "file"; i.accept = "image/png,image/jpeg,image/webp";
    i.onchange = async () => { const f = i.files?.[0]; if (!f) return; try { await saveLogo(await toSquarePng(f)); } catch (e) { showToast({ who: "Couldn't use that file", body: (e as Error).message, av: "!" }); } };
    i.click();
  };

  if (err) return <div className="preview-scope"><div className="bg-white border border-gray-100 rounded-2xl px-6 py-10 text-center text-[14px] text-[#8A92A6]">Couldn&apos;t load brands: {err}</div></div>;
  if (!brands) return <div className="preview-scope"><div className="bg-white border border-gray-100 rounded-2xl"><LoadingBlock /></div></div>;

  return (
    <div className="preview-scope grid gap-5 items-start grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
      {/* left — the brands */}
      <div className="bg-white border border-gray-100 rounded-2xl">
        <div className={`px-[22px] pt-5 pb-3 text-[17px] font-medium ${INK}`}>{brands.length} brands</div>
        <div className="px-3 pb-3.5">
          {brands.map((x) => (
            <button key={x.id} onClick={() => setSel(x.id)} className={`w-full flex items-center gap-3 text-left px-2.5 py-[11px] rounded-xl mb-0.5 ${x.id === sel ? "bg-brand-light" : "hover:bg-[#FAFBFD]"}`}>
              <Logo b={x} size={40} />
              <span className="flex-1 min-w-0">
                <span className={`block truncate text-[14.5px] font-medium ${INK}`}>{x.name}</span>
                <span className={`block text-[12.5px] ${MUTED}`}>{nOn(x)} of 4 connected</span>
                <span className="flex gap-1 mt-1.5">
                  {ORDER.map((k) => { const I = PLAT[k].I, on = x.accounts[k].connected; return (
                    <span key={k} title={`${PLAT[k].n}: ${on ? "connected" : "not connected"}`} className={`w-5 h-5 rounded-md grid place-items-center ${on ? "bg-[#E3F5EA] text-[#1AA053]" : "bg-[#F0F2F8] text-[#B8BECC]"}`}><I size={13} stroke={1.8} /></span>
                  ); })}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* right — one brand */}
      {b && (
        <div className="bg-white border border-gray-100 rounded-2xl px-[26px] pt-6 pb-7">
          <div className="flex items-center gap-[18px] flex-wrap">
            <Logo b={b} size={72} />
            <div className="flex-1 min-w-0">
              <div className={`text-[22px] font-medium ${INK}`}>{b.name}</div>
              <div className={`text-[13px] ${MUTED} mt-0.5`}>{b.handle} · {nOn(b)} of 4 accounts connected</div>
            </div>
            <div className="flex gap-2">
              <button onClick={pick} className={`h-10 px-4 rounded-[10px] border border-gray-100 inline-flex items-center gap-1.5 text-[14px] font-medium ${INK} hover:border-brand hover:text-brand`}><IconUpload size={16} stroke={1.8} />{b.logo ? "Change logo" : "Upload logo"}</button>
              {b.logoUploaded && <button onClick={() => void saveLogo(null)} title="Go back to the Instagram picture" className={`h-10 w-10 rounded-[10px] grid place-items-center ${MUTED} hover:text-[#C0201F]`}><IconTrash size={17} stroke={1.8} /></button>}
            </div>
          </div>
          {!b.logo && <Note>No logo yet. It fills in from the Instagram profile picture once Instagram is connected, or upload one now.</Note>}
          {b.logoUploaded && <Note>Showing the logo you uploaded. Remove it to go back to the Instagram picture.</Note>}

          <div className={`text-[15px] font-medium ${INK} mt-7 mb-3`}>Accounts</div>
          <div className="grid gap-3.5 grid-cols-1 md:grid-cols-2">
            {ORDER.map((k) => <AccountCard key={k} k={k} b={b} />)}
          </div>

          <div className={`text-[15px] font-medium ${INK} mt-7 mb-3`}>Where this brand shows up</div>
          <div className="flex flex-wrap gap-2">
            {([["Brand picker", true], ["Instagram tab", b.accounts.instagram.connected], ["Facebook tab", b.accounts.facebook.connected], ["LinkedIn tab", b.accounts.linkedin.connected], ["YouTube tab", b.accounts.youtube.connected], ["Audience", b.accounts.instagram.connected || b.accounts.facebook.connected || b.accounts.youtube.connected]] as const).map(([t, on]) => (
              <span key={t} className={`text-[12.5px] rounded-full px-3 py-1 ${on ? "bg-[#E3F5EA] text-[#137A3E]" : "bg-[#F0F2F8] text-[#4A5468]"}`}>{on ? "✓ " : ""}{t}</span>
            ))}
          </div>
          <Note>A tab stays greyed out for this brand until that account is connected, so one brand&apos;s numbers never show inside another&apos;s.</Note>
        </div>
      )}
    </div>
  );
}

const Note = ({ children }: { children: ReactNode }) => <div className={`text-[12.5px] ${MUTED} leading-relaxed mt-2.5`}>{children}</div>;

// What each account needs, in plain words — stage 1 connects YouTube from here; the rest say what to do.
function AccountCard({ k, b }: { k: PlatKey; b: Brand }) {
  const a = b.accounts[k], P = PLAT[k], I = P.I;
  let body: ReactNode, action: ReactNode = null;
  if (a.connected) {
    body = k === "youtube" ? "Renews itself every hour — nothing to do."
      : k === "linkedin" ? "The LinkedIn sign-in renews about every 60 days; Integrations warns before it runs out."
      : "Meta's access renews about every 60 days; Integrations warns before it runs out.";
    if (k === "youtube" && a.channel) action = <a href={`/api/auth/youtube/start?channel=${encodeURIComponent(a.channel)}`} className={`h-[34px] px-3 rounded-lg border border-gray-100 inline-flex items-center text-[13px] font-medium ${INK} hover:border-brand hover:text-brand`}>Reconnect</a>;
  } else if (k === "youtube") {
    if (a.channel) {
      body = <>The channel ({a.name}) is known, but its Google sign-in was never finished. Whoever owns the channel&apos;s Google account clicks Connect, signs in and picks <b className="font-medium">{a.name}</b>. You come back to the YouTube tab.</>;
      action = <a href={`/api/auth/youtube/start?channel=${encodeURIComponent(a.channel)}`} className="h-[34px] px-3 rounded-lg bg-brand text-white inline-flex items-center gap-1.5 text-[13px] font-medium hover:bg-brand-dark"><IconLink size={15} stroke={1.8} />Connect YouTube</a>;
    } else body = "No YouTube channel is set for this brand. Connecting a new channel from here comes in the next stage.";
  } else if (k === "linkedin") {
    body = "No LinkedIn company page is linked. Create the page on LinkedIn and make info@goocampus an admin — picking it from here comes in the next stage.";
  } else {
    body = <>This brand&apos;s Facebook page key isn&apos;t in the dashboard&apos;s settings, so Instagram and Facebook can&apos;t load. The page must be in the GooCampus Meta Business account; its key then goes into the settings (<code className="text-[12px]">ACCOUNTS_JSON</code> on Netlify). A Connect button here comes in the next stage.</>;
  }
  return (
    <div className="border border-gray-100 rounded-[14px] p-[18px] flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-[10px] grid place-items-center shrink-0" style={{ background: `${P.c}14`, color: P.c }}><I size={20} stroke={1.8} /></span>
        <div className="flex-1 min-w-0">
          <div className={`text-[15px] font-medium ${INK}`}>{P.n}</div>
          <div className={`text-[12.5px] mt-0.5 ${a.connected ? "text-[#1AA053]" : MUTED}`}>{a.connected ? `Connected · ${a.name}` : "Not connected"}</div>
        </div>
        {a.connected ? <span className="w-[26px] h-[26px] rounded-md grid place-items-center bg-[#E3F5EA] text-[#1AA053]"><IconCheck size={15} stroke={2} /></span>
          : <IconInfoCircle size={18} stroke={1.8} className="text-[#B8BECC]" />}
      </div>
      <div className="text-[13px] text-[#4A5468] leading-relaxed">{body}</div>
      {action && <div className="mt-auto">{action}</div>}
    </div>
  );
}
