/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable instrumentation.ts (Next 14) — used to auto-warm caches in local dev.
  experimental: {
    instrumentationHook: true,
    // The marketing-skills routes read framework .md files via fs at runtime — bundle
    // them into the serverless functions so they exist on Netlify, not just locally.
    outputFileTracingIncludes: {
      "/api/marketing-skills/**": ["./marketing-skills/**/*"],
      // Watchers read notice PDFs (lib/pdf-summary.ts): pdfjs loads its fonts,
      // character maps and wasm decoders from disk at runtime, and @napi-rs/canvas
      // its native binary — none of which the bundler can see.
      "/api/watchers/**": ["./node_modules/pdfjs-dist/{cmaps,standard_fonts,wasm}/**/*", "./node_modules/@napi-rs/**/*"],
      "/api/cron/watchers": ["./node_modules/pdfjs-dist/{cmaps,standard_fonts,wasm}/**/*", "./node_modules/@napi-rs/**/*"],
    },
    // Load these from node_modules at runtime instead of bundling them (native code,
    // workers and wasm don't survive bundling).
    serverComponentsExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  },
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
  // OAuth discovery has to live at the domain root — a client looks at
  // /.well-known/… and nowhere else. These resolve to the root because BASE_PATH is
  // empty in every environment we actually run (that is why the live site serves at
  // /dashboard/... and not /gc-dashboard/dashboard/...). `basePath: false` would be
  // the belt-and-braces version but Next only allows it on external destinations.
  //
  // The "/api/mcp"-suffixed forms are what a client sends when the protected resource
  // sits on a path rather than at the root — both spellings are in the wild.
  async rewrites() {
    return [
      { source: "/.well-known/oauth-authorization-server", destination: "/api/oauth/metadata" },
      { source: "/.well-known/oauth-authorization-server/api/mcp", destination: "/api/oauth/metadata" },
      { source: "/.well-known/oauth-protected-resource", destination: "/api/oauth/resource" },
      { source: "/.well-known/oauth-protected-resource/api/mcp", destination: "/api/oauth/resource" },
    ];
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
