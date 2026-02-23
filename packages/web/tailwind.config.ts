import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        lob: {
          green: "#58B059",
          "green-light": "#6EC46F",
          "green-dark": "#479248",
          "green-dim": "#1A3A1B",
          "green-muted": "rgba(88, 176, 89, 0.12)",
          red: "#FF3B69",
          "red-dim": "rgba(255, 59, 105, 0.12)",
          yellow: "#F0B90B",
        },
        surface: {
          0: "#0A0B0F",
          1: "#0E1217",
          2: "#141820",
          3: "#1A1F2A",
          4: "#222838",
          5: "#2B3245",
        },
        border: {
          DEFAULT: "#1E2431",
          hover: "#2B3245",
          active: "#00D672",
        },
        text: {
          primary: "#EAECEF",
          secondary: "#848E9C",
          tertiary: "#5E6673",
          disabled: "#3C4452",
        },
      },
    },
  },
  plugins: [],
};

export default config;
