/** @type {import('next').NextConfig} */
const nextConfig = {
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
};
export default nextConfig;
