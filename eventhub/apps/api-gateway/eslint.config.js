import base from "../../packages/config/eslint.config.js";

export default [
  ...base,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
      },
    },
  },
];
