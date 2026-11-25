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
        aqi: {
          good: "#2f9e63",
          moderate: "#c99700",
          unhealthySensitive: "#e07b1f",
          unhealthy: "#d6403a",
          veryUnhealthy: "#8a3fb0",
          hazardous: "#7a1e3a",
        },
      },
    },
  },
  plugins: [],
};
export default config;
