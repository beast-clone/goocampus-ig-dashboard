import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Hope UI reskin — indigo primary.
        brand: {
          DEFAULT: "#3A57E8",
          dark: "#2138B0",
          light: "#E9ECFB",
        },
      },
    },
  },
  plugins: [],
};
export default config;
