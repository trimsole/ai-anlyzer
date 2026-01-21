import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#0f172a",
        "surface-2": "#111827",
        accent: "#10b981",
        danger: "#ef4444",
      },
      boxShadow: {
        card: "0 12px 30px -12px rgba(0, 0, 0, 0.45)",
      },
    },
  },
  plugins: [],
};

export default config;
