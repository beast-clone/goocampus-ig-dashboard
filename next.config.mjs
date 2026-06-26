/** @type {import('next').NextConfig} */
const nextConfig = {
  // Served under goocampusevents.com/insights via a Netlify rewrite on the main site.
  // basePath ensures all generated asset/route URLs include this prefix so they resolve
  // correctly when proxied. Override locally with BASE_PATH= (empty) to run at root.
  basePath: process.env.BASE_PATH ?? "/insights",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.cdninstagram.com" },
      { protocol: "https", hostname: "**.fbcdn.net" },
      { protocol: "https", hostname: "scontent.cdninstagram.com" },
    ],
  },
};
export default nextConfig;
