import coreWebVitals from "eslint-config-next/core-web-vitals";

export default [
  ...coreWebVitals,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "lib/e2b/templates/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  {
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
];
