// Pop-up styles for NotificationHost. Kept in a plain module, NOT the "use client"
// component file: the preview layout that injects them is a server component, and
// a value exported from a client module reaches a server component as a client
// reference rather than the actual string — the CSS silently never applied.
export const NOTIF_CSS = `
.gc-notif-bar{position:fixed;top:76px;right:20px;z-index:60;max-width:calc(100vw - 32px);display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #E6E9F2;border-radius:12px;padding:6px 6px 6px 8px;animation:gcNotifIn .2s ease-out}
.gc-notif-bar-main{display:flex;align-items:center;gap:9px;min-width:0;background:none;border:0;padding:0;cursor:pointer;font:inherit}
.gc-notif-bar-icon{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:#EEF1FD;color:#3A57E8;flex-shrink:0}
.gc-notif-bar-text{font-size:13.5px;font-weight:500;color:#232D42;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gc-notif-bar-go{height:30px;padding:0 12px;border-radius:8px;border:0;background:#3A57E8;color:#fff;font-size:12.5px;font-weight:500;cursor:pointer;flex-shrink:0}
.gc-notif-bar-go:hover{background:#2138B0}
.gc-notif-bar-x{border:0;background:none;color:#8A92A6;cursor:pointer;padding:6px;border-radius:6px;line-height:0;flex-shrink:0}
.gc-notif-bar-x:hover{color:#232D42;background:#F6F7FB}
@keyframes gcNotifIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.gc-notif-bar{animation:none}}
html[data-theme="dark"] .gc-notif-bar{background:var(--d-card);border-color:var(--d-line)}
html[data-theme="dark"] .gc-notif-bar-text{color:var(--d-ink)}
html[data-theme="dark"] .gc-notif-bar-icon{background:var(--d-raised);color:var(--d-brand-text)}
html[data-theme="dark"] .gc-notif-bar-x{color:var(--d-muted)}
html[data-theme="dark"] .gc-notif-bar-x:hover{background:var(--d-raised);color:var(--d-ink)}
`;
