import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Locally-extracted third-party packages (for code inspection, not shipped):
    "typeform_pkg/**",
    "typeform_embed_pkg/**",
    // Local package manager caches:
    ".npm-cache/**",
    ".pnpm-cache/**",
    // Agent + audit artefacts (transient; never shipped):
    ".claude/**",
    "test-results/**",
    "playwright-report/**",
    "visual-audit-out/**",
  ]),
]);

export default eslintConfig;
