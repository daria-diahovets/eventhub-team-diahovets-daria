import base from "../../packages/config/eslint.config.js";

export default [
  ...base,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        window: "readonly",
        document: "readonly",
        fetch: "readonly",
        console: "readonly",
      },
    },
  },
];
