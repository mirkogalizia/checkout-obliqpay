/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f4ff",
          100: "#d9e2ff",
          200: "#b3c3ff",
          300: "#8da4ff",
          400: "#6684ff",
          500: "#3f63ff",
          600: "#2749e0",
          700: "#1f39ad",
          800: "#17297a",
          900: "#0f1a47",
        },
      },
      boxShadow: {
        "soft-xl": "0 22px 45px rgba(15, 23, 42, 0.25)",
      },
      borderRadius: {
        "3xl": "1.75rem",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};