import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  ...compat.extends("next/core-web-vitals"),
  {
    ignores: ["node_modules/**", ".next/**", "lib/e2b/templates/**", "coverage/**", "playwright-report/**", "test-results/**"],
  },
  {
    rules: {
      // Warn on console.* in production code (lib/ and app/api/)
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
]
