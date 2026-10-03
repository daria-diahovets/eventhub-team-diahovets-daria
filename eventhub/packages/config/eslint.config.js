// Спільна база ESLint (flat config).
// Кожен застосунок підключає її та додає власні правила:
//
//   import base from "../../packages/config/eslint.config.js";
//   export default [...base, { /* специфіка застосунку */ }];

import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["**/dist/**", "**/build/**", "**/generated/**", "**/node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "warn",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": "off",
    },
  },
];
