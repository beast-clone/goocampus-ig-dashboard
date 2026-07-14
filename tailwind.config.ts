import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Driven by CSS vars so a scoped wrapper (e.g. .hope-scope) can re-theme
        // the brand accent without touching the rest of the app. Defaults below
        // (in globals.css :root) reproduce the original violet exactly.
        brand: {
          DEFAULT: "rgb(var(--brand) / <alpha-value>)",
          dark: "rgb(var(--brand-dark) / <alpha-value>)",
          light: "rgb(var(--brand-light) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};
export default config;
