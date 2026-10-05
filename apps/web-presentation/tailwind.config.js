/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /** Narrative presentation + BYO entry */
        foyer: {
          paper: "#fff8e7",
          ink: "#002fa7",
          muted: "#1e3359",
          accent: "#d9774a",
        },
        byo: {
          bg: "#fff8e7",
          ink: "#002fa7",
          muted: "#1e3359",
          accent: "#d9774a",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        prose: ["var(--font-prose)", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
