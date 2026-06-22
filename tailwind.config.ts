import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#6E48F8",
          dark: "#4A2EC4",
          light: "#EDE7FE",
        },
      },
    },
  },
  plugins: [],
};
export default config;
