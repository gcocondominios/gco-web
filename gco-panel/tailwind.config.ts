import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Exact GCO Stitch DESIGN.md Architectural Corporate SaaS palette
        primary: "#002046",
        "on-primary": "#ffffff",
        "primary-container": "#1b365d",
        "on-primary-container": "#87a0cd",
        "primary-fixed": "#d6e3ff",
        secondary: "#39618c",
        "secondary-slate": "#2b547e",
        "secondary-fixed": "#d1e4ff",
        "on-secondary-fixed": "#001d36",
        tertiary: "#4a8c2a",
        "tertiary-fixed": "#acf686",
        "tertiary-container": "#143f00",
        surface: "#f8f9fd",
        "surface-canvas": "#f8fafc",
        "surface-card": "#ffffff",
        "surface-subtle": "#f1f5f9",
        "surface-variant": "#e1e2e6",
        "on-surface": "#191c1f",
        "on-surface-variant": "#44474e",
        outline: "#74777f",
        "border-subtle": "#e2e8f0",
        "border-strong": "#cbd5e1",
        "status-operativo-text": "#15803d",
        "status-operativo-bg": "#dcfce7",
        "status-observacion-text": "#b45309",
        "status-observacion-bg": "#fef3c7",
        "status-critico-text": "#b91c1c",
        "status-critico-bg": "#fee2e2",
        "inverse-surface": "#2e3134",
        "inverse-on-surface": "#eff1f5",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(27, 54, 93, 0.04)",
        panel: "0 4px 12px -2px rgba(27, 54, 93, 0.08), 0 2px 6px -1px rgba(27, 54, 93, 0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
