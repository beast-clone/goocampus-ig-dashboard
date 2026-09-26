import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Driven by CSS vars so a scoped wrapper (e.g. .preview-scope) can re-theme
        // the brand accent without touching the rest of the app. Defaults live in
        // globals.css :root and reproduce the original violet exactly.
        //
        // These read --brand-RGB, not --brand, and the suffix is the whole point.
        // Tailwind needs bare channels ("58 87 232") for rgb(var(…) / <alpha>);
        // hand-written stylesheets need a colour ("#3A57E8") for `background: var(…)`.
        // Both used to be called --brand, so whichever scope you were inside broke the
        // other: .preview-scope set channels and every plain `var(--brand)` fell back
        // to transparent, so .hcal/.tcmd/.sl/.hmd/.hshell each re-set it to a hex —
        // which in turn made every bg-brand/text-brand inside THEM paint nothing.
        // White-on-white buttons, no error. Separate names, no shadowing, both work.
        brand: {
          DEFAULT: "rgb(var(--brand-rgb) / <alpha-value>)",
          dark: "rgb(var(--brand-dark-rgb) / <alpha-value>)",
          light: "rgb(var(--brand-light-rgb) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};
export default config;
