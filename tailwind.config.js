/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        iitm: {
          blue: "#0c2340",
          maroon: "#782F40",
          gold: "#ce9a29",
          slate: "#1f2937",
        },
      },
    },
  },
  plugins: [],
};
