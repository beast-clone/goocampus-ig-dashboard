/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable instrumentation.ts (Next 14) — used to auto-warm caches in local dev.
  experimental: { instrumentationHook: true },
  // Served under goocampusevents.com/insights via a Netlify rewrite on the main site.
  // basePath ensures all generated asset/route URLs include this prefix so they resolve
  // correctly when proxied. Override locally with BASE_PATH= (empty) to run at root.
  basePath: process.env.BASE_PATH ?? "/gc-dashboard",
  // Expose basePath to client bundles so the FetchBasePathPatch can prefix /api/* calls.
  // Next.js basePath does NOT auto-prefix client-side fetch() — must do it ourselves.
  env: {
    NEXT_PUBLIC_BASE_PATH: process.env.BASE_PATH ?? "/gc-dashboard",
  },
  // Keep source maps off in production — they'd otherwise expose readable server logic
  // and import paths to anyone who opens devtools on the live site.
  productionBrowserSourceMaps: false,
  // Trim the unsigned `x-powered-by: Next.js` response header (avoids advertising the framework).
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.cdninstagram.com" },
      { protocol: "https", hostname: "**.fbcdn.net" },
      { protocol: "https", hostname: "**.fna.fbcdn.net" },
      { protocol: "https", hostname: "scontent.cdninstagram.com" },
      { protocol: "https", hostname: "*.apify.com" },
    ],
  },
  webpack: (config) => {
    // pdfjs-dist references its worker via `new URL("pdf.worker.min.mjs", import.meta.url)`;
    // webpack emits that worker as a chunk and Terser then fails minifying it
    // ("import.meta cannot be used outside of module code"). We serve the worker from
    // /public and set GlobalWorkerOptions.workerSrc ourselves, so disable url-asset
    // emission for pdfjs modules.
    config.module.rules.push({ test: /pdfjs-dist[\\/]/, parser: { url: false } });
    // LIGHT_BUILD=1 → skip minification. Used for local `next start` on low-RAM machines:
    // it sidesteps the pdfjs-worker Terser crash and makes the build faster + lighter.
    // Production (Netlify) leaves this unset, so it still minifies normally.
    if (process.env.LIGHT_BUILD === "1") config.optimization.minimize = false;
    return config;
  },
};
export default nextConfig;
