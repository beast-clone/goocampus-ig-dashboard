// Sanitiser for the few places that render stored text as HTML.
//
// Marketing Hub shows a task's "Content" and "Additional info" as rich text,
// because both arrive from Airtable with real markup in them and showing the
// tags raw would be unreadable. Both went through dangerouslySetInnerHTML with
// nothing in between, and neither write path sanitises: /api/marketing-hub/update
// accepts both fields, and lib/airtable-import.ts copies them straight across —
// so anyone who can edit a task, or edit the Airtable base without a dashboard
// account at all, could store `<p><img src=x onerror=...></p>` and have it run
// for every teammate who opened that task, admins included.
//
// That is not a cosmetic bug. The session cookie is httpOnly, but the script
// does not need to read it: a same-origin fetch carries it automatically and
// satisfies the Origin-equals-Host CSRF check in middleware.ts, so a payload
// can call /api/admin/team and make itself an admin. Nor does the CSP stop it —
// the headers in netlify.toml only reach static files, never the SSR routes the
// dashboard is served from (measured 2026-10-04; see next.config.mjs, which now
// sets them at the framework level so they actually apply).
//
// Sanitising at RENDER rather than on write is deliberate: it also neutralises
// anything already sitting in the table from before this existed.
//
// There is a second sanitiser in app/api/radar/article for external article
// HTML. That one runs on the server and uses JSDOM, which cannot be used here —
// these are client components. Same intent, different environment.

import DOMPurify from "dompurify";

// Tags the Airtable rich-text fields legitimately produce. Anything else is
// dropped rather than escaped, so unexpected markup disappears quietly instead
// of filling the panel with visible angle brackets.
const ALLOWED_TAGS = [
  "p", "br", "div", "span",
  "strong", "b", "em", "i", "u", "s", "code", "pre", "blockquote",
  "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "a", "hr",
  "table", "thead", "tbody", "tr", "th", "td",
];

// No style, no class, no id — none of them are needed to render a brief, and
// style alone is enough to cover the page with an invisible clickable overlay.
const ALLOWED_ATTR = ["href", "title", "target", "rel"];

/**
 * Make stored rich text safe to pass to dangerouslySetInnerHTML.
 *
 * Browser-only: DOMPurify needs a real DOM. On the server it returns an empty
 * string rather than the input, so a server render can never be the thing that
 * emits an unsanitised payload. The call sites are client components, so the
 * text appears as soon as they hydrate.
 */
export function sanitizeRichText(html: string): string {
  if (!html) return "";
  if (typeof window === "undefined") return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Keep javascript: and data: URLs out of href entirely.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|\/)/i,
    // Belt and braces: these are already excluded by ALLOWED_TAGS, but naming
    // them means a future widening of that list cannot quietly let them back.
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "base", "link", "meta", "svg", "math"],
    FORBID_ATTR: ["style", "srcset", "formaction", "xlink:href"],
  });
}
