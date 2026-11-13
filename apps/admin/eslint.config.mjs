import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      // ARCHITECTURE.md §6.1: narrow explicitly, never assert.
      "@typescript-eslint/no-non-null-assertion": "error",
      "no-console": ["error"],
      "import/order": [
        "error",
        {
          groups: [
            ["builtin", "external", "internal"],
            ["parent", "sibling", "index"],
          ],
          "newlines-between": "never",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
