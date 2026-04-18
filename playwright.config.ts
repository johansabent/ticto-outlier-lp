import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['html'], ['github']] : 'list',
  use: {
    // Port 3100 is deliberate — 3000 often collides with other local dev
    // servers (this machine frequently runs multiple Next projects). Using
    // a dedicated E2E port prevents the test from reusing a stale foreign
    // server that happens to respond on 3000.
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3100',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.PLAYWRIGHT_TEST_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev --port 3100',
        url: 'http://localhost:3100',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        // Inject deterministic env vars the handler requires so `pnpm dev`
        // can boot and `/api/lead` can reach its env-validation path without
        // a `.env.local`. These are FORCED literals — never fall back to
        // process.env — so running `pnpm e2e` on a developer machine with
        // real credentials in the shell (HUBSPOT_PRIVATE_APP_TOKEN, TYPEFORM_WEBHOOK_SECRET)
        // can NEVER reach production CRM, and the test's hardcoded HMAC secret
        // always matches what the handler validates against.
        env: {
          HUBSPOT_PRIVATE_APP_TOKEN: 'e2e-test-token',
          TYPEFORM_WEBHOOK_SECRET: 'dev-placeholder-secret',
          TYPEFORM_FORM_ID: 'FbFMsO5x',
          NEXT_PUBLIC_TYPEFORM_FORM_ID: 'FbFMsO5x',
          NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
        },
      },
});
