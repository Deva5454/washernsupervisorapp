/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand: SBI-style cerulean blue. Overriding Tailwind's built-in
        // `blue` ramp means every existing `bg-blue-600`, `text-blue-400`,
        // etc. across the app becomes this brand color automatically —
        // no per-file class renaming needed.
        blue: {
          50: "#EAFAFF",
          100: "#D2F3FE",
          200: "#A6E7FC",
          300: "#70D5F7",
          400: "#3CC1F1",
          500: "#29C2F5",
          600: "#00B5EF",
          700: "#0089BD",
          800: "#046592",
          900: "#0B3D57",
        },
        // Overriding `gray` with a blue-tinted neutral scale (Tailwind's
        // `slate` values) so nothing in the app reads as flat black —
        // every existing `bg-gray-900`, `text-gray-500`, etc. shifts to a
        // professional blue-gray automatically.
        gray: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a",
        },
        // Exact brand values for the handful of spots that want the
        // literal SBI blue rather than a ramp step (header, hero cards).
        brand: {
          DEFAULT: "#00B5EF",
          dark: "#0089BD",
          light: "#EAFAFF",
        },
        // Deep indigo-navy, paired with `brand` in gradients wherever the
        // app previously used a near-black surface.
        navy: {
          DEFAULT: "#14204A",
          dark: "#0B142F",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
