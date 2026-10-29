"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { IconBrandInstagram, IconBrandFacebook, IconBrandLinkedin, IconBrandYoutube, IconCheck, IconUpload, IconLink, IconTrash, IconInfoCircle, IconPlus, IconX, type Icon } from "@tabler/icons-react";
import { PreviewDashboardShell } from "@/app/(dashboard)/dashboard/preview/PreviewDashboardShell";
import { LoadingBlock } from "@/components/LoadingBlock";
import { showToast } from "../Toast";
import { Overlay } from "../Overlay";
import { confirmDialog, promptDialog } from "../ConfirmDialog";

// Brands (docs/BRANDS_SPEC.md · prototype docs/brands-prototype/v1.html). Stage 1: every brand,
// its logo (upload one), and whether each of its four accounts is really connected; YouTube
// connects from here. Stage 2: add a brand, and connect its Instagram + Facebook by picking the
// Facebook page (the server fetches and stores the page key — the browser never sees it).

type Acc = { connected: boolean; name: string | null; page?: string | null; channel?: string | null };
type Brand = { id: string; name: string; handle: string; added: boolean; metaOnPage: boolean; logo: string | null; logoUploaded: boolean; accounts: Record<PlatKey, Acc> };
type FbPage = { pageId: string; pageName: string; igUserId: string | null; igUsername: string | null; usedBy: string | null };
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
  const [picking, setPicking] = useState(false);
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
  const post = async (url: string, method: string, body: object) => {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true as const, j } : { ok: false as const, error: (j.error as string) || `HTTP ${r.status}` };
  };
  const addBrand = async () => {
    const name = await promptDialog({ title: "Add a brand", label: "Brand name", placeholder: "e.g. IMT Programme", action: "Add brand", required: true });
    if (!name?.trim()) return;
    const r = await post("/api/brands", "POST", { name });
    if (!r.ok) { showToast({ who: "Couldn't add the brand", body: r.error, av: "!" }); return; }
    showToast({ who: "Brand added", body: `${name.trim()} — now connect its Instagram + Facebook.`, av: "✓" });
    setSel(r.j.id); load();
  };
  const disconnect = async () => {
    if (!b || !(await confirmDialog({ title: `Disconnect ${b.name}'s Instagram + Facebook?`, body: "Its tabs stop loading until it's connected again. Nothing is deleted on Instagram or Facebook.", action: "Disconnect", danger: true }))) return;
    const r = await post("/api/brands/meta", "DELETE", { brand: b.id });
    if (!r.ok) { showToast({ who: "Couldn't disconnect", body: r.error, av: "!" }); return; }
    showToast({ who: "Disconnected", body: `${b.name}'s Instagram + Facebook.`, av: "✓" }); load();
  };
  const removeBrand = async () => {
    if (!b || !(await confirmDialog({ title: `Remove ${b.name}?`, body: "It goes off the Brands page. You can add it again any time.", action: "Remove", danger: true }))) return;
    const r = await post("/api/brands", "DELETE", { id: b.id });
    if (!r.ok) { showToast({ who: "Couldn't remove the brand", body: r.error, av: "!" }); return; }
    setSel(""); load();
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
        <div className="px-[22px] pt-5 pb-3 flex items-center justify-between gap-2">
          <span className={`text-[17px] font-medium ${INK}`}>{brands.length} brands</span>
          <button onClick={() => void addBrand()} className="h-[34px] px-3 rounded-lg bg-brand text-white inline-flex items-center gap-1.5 text-[13px] font-medium hover:bg-brand-dark"><IconPlus size={15} stroke={1.8} />Add brand</button>
        </div>
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
              <div className={`text-[13px] ${MUTED} mt-0.5`}>{(b.accounts.instagram.name || b.handle) ? `${b.accounts.instagram.name || b.handle} · ` : ""}{nOn(b)} of 4 accounts connected</div>
            </div>
            <div className="flex gap-2">
              <button onClick={pick} className={`h-10 px-4 rounded-[10px] border border-gray-100 inline-flex items-center gap-1.5 text-[14px] font-medium ${INK} hover:border-brand hover:text-brand`}><IconUpload size={16} stroke={1.8} />{b.logo ? "Change logo" : "Upload logo"}</button>
              {b.logoUploaded && <button onClick={() => void saveLogo(null)} title="Go back to the Instagram picture" className={`h-10 w-10 rounded-[10px] grid place-items-center ${MUTED} hover:text-[#C0201F]`}><IconTrash size={17} stroke={1.8} /></button>}
              {b.added && !b.metaOnPage && <button onClick={() => void removeBrand()} className={`h-10 px-4 rounded-[10px] border border-gray-100 inline-flex items-center gap-1.5 text-[14px] font-medium ${MUTED} hover:text-[#C0201F]`}><IconX size={16} stroke={1.8} />Remove brand</button>}
            </div>
          </div>
          {!b.logo && <Note>No logo yet. It fills in from the Instagram profile picture once Instagram is connected, or upload one now.</Note>}
          {b.logoUploaded && <Note>Showing the logo you uploaded. Remove it to go back to the Instagram picture.</Note>}

          <div className={`text-[15px] font-medium ${INK} mt-7 mb-3`}>Accounts</div>
          <div className="grid gap-3.5 grid-cols-1 md:grid-cols-2">
            {ORDER.map((k) => <AccountCard key={k} k={k} b={b} onConnectMeta={() => setPicking(true)} onDisconnectMeta={() => void disconnect()} />)}
          </div>

          <div className={`text-[15px] font-medium ${INK} mt-7 mb-3`}>Where this brand shows up</div>
          <div className="flex flex-wrap gap-2">
            {([["Brand picker", !b.added || b.accounts.instagram.connected], ["Instagram tab", b.accounts.instagram.connected], ["Facebook tab", b.accounts.facebook.connected], ["LinkedIn tab", b.accounts.linkedin.connected], ["YouTube tab", b.accounts.youtube.connected], ["Audience", b.accounts.instagram.connected || b.accounts.facebook.connected || b.accounts.youtube.connected]] as const).map(([t, on]) => (
              <span key={t} className={`text-[12.5px] rounded-full px-3 py-1 inline-flex items-center gap-1 ${on ? "bg-[#E3F5EA] text-[#137A3E]" : "bg-[#F0F2F8] text-[#4A5468]"}`}>{on && <IconCheck size={13} stroke={2} />}{t}</span>
            ))}
          </div>
          <Note>A tab stays greyed out for this brand until that account is connected, so one brand&apos;s numbers never show inside another&apos;s.</Note>
        </div>
      )}
      {picking && b && <PagePicker brand={b} onClose={() => setPicking(false)} onDone={() => { setPicking(false); load(); }} />}
    </div>
  );
}

const Note = ({ children }: { children: ReactNode }) => <div className={`text-[12.5px] ${MUTED} leading-relaxed mt-2.5`}>{children}</div>;

// What each account needs, in plain words — stage 1 connects YouTube from here; the rest say what to do.
function AccountCard({ k, b, onConnectMeta, onDisconnectMeta }: { k: PlatKey; b: Brand; onConnectMeta: () => void; onDisconnectMeta: () => void }) {
  const a = b.accounts[k], P = PLAT[k], I = P.I;
  let body: ReactNode, action: ReactNode = null;
  if (a.connected) {
    body = k === "youtube" ? "Renews itself every hour — nothing to do."
      : k === "linkedin" ? "The LinkedIn sign-in renews about every 60 days; Integrations warns before it runs out."
      : "Meta's access renews about every 60 days; Integrations warns before it runs out.";
    if (k === "instagram" && b.metaOnPage)
      action = <button onClick={onDisconnectMeta} className={`h-[34px] px-3 rounded-lg border border-gray-100 inline-flex items-center text-[13px] font-medium ${MUTED} hover:text-[#C0201F]`}>Disconnect</button>;
    if (k === "youtube" && a.channel) action = <a href={`/api/auth/youtube/start?channel=${encodeURIComponent(a.channel)}`} className={`h-[34px] px-3 rounded-lg border border-gray-100 inline-flex items-center text-[13px] font-medium ${INK} hover:border-brand hover:text-brand`}>Reconnect</a>;
  } else if (k === "youtube") {
    if (a.channel) {
      body = <>The channel ({a.name}) is known, but its Google sign-in was never finished. Whoever owns the channel&apos;s Google account clicks Connect, signs in and picks <b className="font-medium">{a.name}</b>. You come back to the YouTube tab.</>;
      action = <a href={`/api/auth/youtube/start?channel=${encodeURIComponent(a.channel)}`} className="h-[34px] px-3 rounded-lg bg-brand text-white inline-flex items-center gap-1.5 text-[13px] font-medium hover:bg-brand-dark"><IconLink size={15} stroke={1.8} />Connect YouTube</a>;
    } else body = "No YouTube channel is set for this brand. Connecting a new channel from here comes later.";
  } else if (k === "linkedin") {
    body = "No LinkedIn company page is linked. Create the page on LinkedIn and make info@goocampus an admin — picking it from here comes later.";
  } else if (k === "facebook") {
    body = "Connects together with Instagram — use the button on the Instagram card.";
  } else {
    body = <>Pick this brand&apos;s Facebook page. Instagram comes with it — the page must have the brand&apos;s Instagram business account linked, and be managed by the dashboard&apos;s Meta login.</>;
    action = <button onClick={onConnectMeta} className="h-[34px] px-3 rounded-lg bg-brand text-white inline-flex items-center gap-1.5 text-[13px] font-medium hover:bg-brand-dark"><IconLink size={15} stroke={1.8} />Connect Instagram + Facebook</button>;
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

// The Facebook pages the dashboard's Meta login manages. Picking one connects it and its linked
// Instagram account to the brand; pages without Instagram, or already used by a brand, can't be picked.
function PagePicker({ brand, onClose, onDone }: { brand: Brand; onClose: () => void; onDone: () => void }) {
  const [pages, setPages] = useState<FbPage[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/brands/meta?brand=${encodeURIComponent(brand.id)}`, { cache: "no-store" }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      // Pages that can be picked first.
      const ok = (p: FbPage) => (p.igUserId && !p.usedBy ? 0 : 1);
      setPages((j.pages as FbPage[]).sort((x, y) => ok(x) - ok(y)));
    }).catch((e) => setErr((e as Error).message));
  }, [brand.id]);
  const connect = async (p: FbPage) => {
    setBusy(p.pageId);
    const r = await fetch("/api/brands/meta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand: brand.id, pageId: p.pageId }) });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { showToast({ who: "Couldn't connect", body: j.error || `HTTP ${r.status}`, av: "!" }); return; }
    showToast({ who: "Connected", body: `${brand.name}: ${j.instagram} and ${j.facebook}.`, av: "✓" });
    onDone();
  };
  return (
    <Overlay onClose={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="preview-scope bg-white border border-gray-100 rounded-2xl w-full max-w-[560px] mt-[8vh]">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <div className={`text-[16px] font-medium ${INK}`}>Connect Instagram + Facebook</div>
            <div className={`text-[12.5px] ${MUTED} mt-0.5`}>Pick {brand.name}&apos;s Facebook page</div>
          </div>
          <button onClick={onClose} className={`w-8 h-8 rounded-lg grid place-items-center ${MUTED} hover:bg-[#F6F7FB]`}><IconX size={18} stroke={1.8} /></button>
        </div>
        <div className="p-3 max-h-[60vh] overflow-auto">
          {err ? <div className="px-3 py-6 text-[13.5px] text-[#4A5468] leading-relaxed">{err}</div>
            : !pages ? <LoadingBlock />
            : !pages.length ? <div className="px-3 py-6 text-[13.5px] text-[#4A5468]">The dashboard&apos;s Meta login doesn&apos;t manage any Facebook pages. Add the page to the GooCampus Meta Business account first.</div>
            : pages.map((p) => {
              const why = !p.igUserId ? "No Instagram business account linked" : p.usedBy ? `Already used by ${p.usedBy}` : null;
              return (
                <div key={p.pageId} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#FAFBFD]">
                  <span className="w-9 h-9 rounded-[10px] grid place-items-center shrink-0" style={{ background: "#1877F214", color: "#1877F2" }}><IconBrandFacebook size={18} stroke={1.8} /></span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-[14px] font-medium ${INK} truncate`}>{p.pageName}</div>
                    <div className={`text-[12.5px] ${MUTED} inline-flex items-center gap-1`}>
                      {p.igUsername ? <><IconBrandInstagram size={13} stroke={1.8} />@{p.igUsername}</> : null}
                      {why && <span>{p.igUsername ? " · " : ""}{why}</span>}
                    </div>
                  </div>
                  <button disabled={!!why || !!busy} onClick={() => void connect(p)}
                    className="h-[32px] px-3 rounded-lg bg-brand text-white text-[13px] font-medium hover:bg-brand-dark disabled:bg-[#F0F2F8] disabled:text-[#B8BECC]">
                    {busy === p.pageId ? "Connecting…" : "Connect"}
                  </button>
                </div>
              );
            })}
        </div>
      </div>
    </Overlay>
  );
}
