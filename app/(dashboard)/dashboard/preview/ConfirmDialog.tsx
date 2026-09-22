"use client";
import { useCallback, useRef, useState } from "react";
import { IconAlertTriangle, IconInfoCircle } from "@tabler/icons-react";
import { Overlay } from "./Overlay";

// The dashboard's own confirm / notice popup, in place of the browser's grey
// window.confirm() / alert() boxes. Same look as the Master sheet's delete popup.
//
//   const [ask, dialog] = useConfirm();
//   if (!(await ask({ title: "Delete topic?", body: "…", action: "Delete", danger: true }))) return;
//   …
//   return <>{…}{dialog}</>;
//
// Pass `notice: true` for a one-button message (replaces alert()).
export type ConfirmOpts = { title: string; body?: React.ReactNode; action?: string; danger?: boolean; notice?: boolean };

export function useConfirm(): [(o: ConfirmOpts) => Promise<boolean>, React.ReactNode] {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const resolver = useRef<(v: boolean) => void>();
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>((res) => { resolver.current = res; setOpts(o); }), []);
  const close = useCallback((v: boolean) => { resolver.current?.(v); resolver.current = undefined; setOpts(null); }, []);
  const dialog = opts && (
    <Overlay onClose={() => close(false)} className="fixed inset-0 bg-black/40 z-[300] flex items-center justify-center p-6 preview-scope">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-start gap-3 px-5 pt-5">
          <span className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${opts.danger ? "bg-[#FDECEA] text-[#C0392B]" : "bg-brand-light text-brand"}`}>
            {opts.danger ? <IconAlertTriangle size={18} stroke={1.8} /> : <IconInfoCircle size={18} stroke={1.8} />}
          </span>
          <div className="min-w-0">
            <h2 className="text-[16px] font-medium text-[#232D42]">{opts.title}</h2>
            {opts.body && <div className="text-[14px] text-[#8A92A6] mt-1">{opts.body}</div>}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 mt-4 border-t border-gray-100">
          {!opts.notice && <button onClick={() => close(false)} className="h-9 px-3 rounded text-[14px] font-medium text-gray-600 hover:text-gray-900">Cancel</button>}
          <button autoFocus onClick={() => close(true)}
            className={`h-9 px-4 rounded text-[14px] font-medium text-white hover:brightness-110 ${opts.danger ? "bg-[#C0392B]" : "bg-brand"}`}>
            {opts.action || (opts.notice ? "OK" : "Confirm")}
          </button>
        </div>
      </div>
    </Overlay>
  );
  return [ask, dialog];
}
