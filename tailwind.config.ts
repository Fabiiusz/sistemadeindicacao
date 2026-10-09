import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // A cor da marca vem do espaço (CSS var), com fallback.
        marca: "rgb(var(--cor-marca, 124 58 237) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};

export default config;
