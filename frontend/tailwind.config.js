/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Semantic tokens -> CSS variables defined in src/styles/index.css.
        // A full ui-ux-pro-max design pass refines these in a frontend milestone.
        bg: "rgb(var(--c-bg) / <alpha-value>)",
        surface: "rgb(var(--c-surface) / <alpha-value>)",
        "surface-2": "rgb(var(--c-surface-2) / <alpha-value>)",
        border: "rgb(var(--c-border) / <alpha-value>)",
        fg: "rgb(var(--c-fg) / <alpha-value>)",
        muted: "rgb(var(--c-muted) / <alpha-value>)",
        brand: "rgb(var(--c-brand) / <alpha-value>)",
        "brand-fg": "rgb(var(--c-brand-fg) / <alpha-value>)",
        ok: "rgb(var(--c-ok) / <alpha-value>)",
        warn: "rgb(var(--c-warn) / <alpha-value>)",
        danger: "rgb(var(--c-danger) / <alpha-value>)",
        "k-1": "rgb(var(--k-1) / <alpha-value>)",
        "k-2": "rgb(var(--k-2) / <alpha-value>)",
        "k-3": "rgb(var(--k-3) / <alpha-value>)",
        "k-4": "rgb(var(--k-4) / <alpha-value>)",
        "k-5": "rgb(var(--k-5) / <alpha-value>)",
        "k-6": "rgb(var(--k-6) / <alpha-value>)",
        "k-7": "rgb(var(--k-7) / <alpha-value>)",
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
