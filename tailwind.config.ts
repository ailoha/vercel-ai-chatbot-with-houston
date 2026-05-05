import type { Config } from "tailwindcss";
import { fontFamily } from "tailwindcss/defaultTheme";
import animate from "tailwindcss-animate";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/streamdown/dist/*.js",
  ],
  theme: {
    extend: {
      colors: {
        houston: {
          bg: "#17191e",
          panel: "#23262d",
          border: "#343841",
          text: "#bfc1c9",
          subtext: "#858b98",
          accent1: "#3245ff",
          accent2: "#bc52ee",
          accent3: "#4af2c8",
          accent4: "#2f4cb3",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", ...fontFamily.sans],
        mono: ['"MD IO 0.5"', ...fontFamily.mono],
      },
    },
  },
  plugins: [animate],
};

export default config;
