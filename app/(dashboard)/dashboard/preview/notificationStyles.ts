// Pop-up styles for NotificationHost. Kept in a plain module, NOT the "use client"
// component file: the preview layout that injects them is a server component, and
// a value exported from a client module reaches a server component as a client
// reference rather than the actual string — the CSS silently never applied.
export const NOTIF_CSS = `
.gc-notif-stack{position:fixed;top:76px;right:20px;z-index:60;width:360px;max-width:calc(100vw - 32px);display:flex;flex-direction:column;gap:10px}
.gc-notif{position:relative;background:#fff;border:1px solid #E6E9F2;border-left:3px solid #3A57E8;border-radius:12px;box-shadow:0 12px 32px rgba(35,45,66,.14);padding:12px 12px 10px;animation:gcNotifIn .22s ease-out}
.gc-notif.is-action{border-left-color:#C2410C}
.gc-notif-body{display:flex;gap:10px;align-items:flex-start;width:100%;text-align:left;background:none;border:0;padding:0 22px 0 0;cursor:pointer;font:inherit}
.gc-notif-emoji{font-size:18px;line-height:1.2;flex-shrink:0}
.gc-notif-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.gc-notif-tag{align-self:flex-start;font-size:10.5px;font-weight:500;letter-spacing:.04em;text-transform:uppercase;color:#C2410C;background:#FFF1E8;border-radius:999px;padding:1px 7px;margin-bottom:2px}
.gc-notif-title{font-size:14px;font-weight:500;color:#232D42;line-height:1.35}
.gc-notif-sub{font-size:12.5px;color:#8A92A6;line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.gc-notif-x{position:absolute;top:8px;right:8px;border:0;background:none;color:#8A92A6;cursor:pointer;padding:3px;border-radius:6px;line-height:0}
.gc-notif-x:hover{color:#232D42;background:#F6F7FB}
.gc-notif-actions{display:flex;gap:6px;margin-top:10px;padding-left:28px}
.gc-notif-go{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 10px;border-radius:8px;border:0;background:#3A57E8;color:#fff;font-size:12.5px;font-weight:500;cursor:pointer}
.gc-notif-go:hover{background:#2138B0}
.gc-notif-dismiss{height:30px;padding:0 10px;border-radius:8px;border:1px solid #E6E9F2;background:#fff;color:#4A5468;font-size:12.5px;font-weight:500;cursor:pointer}
.gc-notif-dismiss:hover{border-color:#3A57E8;color:#3A57E8}
.gc-notif-more{align-self:flex-end;border:1px solid #E6E9F2;background:#fff;color:#3A57E8;font-size:12.5px;font-weight:500;border-radius:999px;padding:5px 12px;cursor:pointer}
@keyframes gcNotifIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.gc-notif{animation:none}}
html[data-theme="dark"] .gc-notif,html[data-theme="dark"] .gc-notif-more,html[data-theme="dark"] .gc-notif-dismiss{background:var(--d-card);border-color:var(--d-line)}
html[data-theme="dark"] .gc-notif{box-shadow:0 12px 32px rgba(0,0,0,.45)}
html[data-theme="dark"] .gc-notif-title{color:var(--d-ink)}
html[data-theme="dark"] .gc-notif-sub,html[data-theme="dark"] .gc-notif-x{color:var(--d-muted)}
html[data-theme="dark"] .gc-notif-x:hover{background:var(--d-raised);color:var(--d-ink)}
html[data-theme="dark"] .gc-notif-dismiss{color:var(--d-ink2)}
html[data-theme="dark"] .gc-notif-more{color:var(--d-brand-text)}
html[data-theme="dark"] .gc-notif-tag{background:rgba(194,65,12,.18);color:#F59E6B}
`;
