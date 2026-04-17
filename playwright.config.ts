import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['html'], ['github']] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3000',
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
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        // Inject env vars the handler requires so `pnpm dev` can boot and
        // `/api/lead` can reach its env-validation path without a `.env.local`.
        // TYPEFORM_WEBHOOK_SECRET is the dev default ('dev-placeholder-secret')
        // — the E2E computes its HMAC against this same literal so the handler
        // accepts the signed body. DATACRAZY_API_TOKEN is a throwaway value
        // (real Datacrazy traffic is mocked via page.route in-browser and is
        // never reached for server-side tests — see deviation note in the spec).
        env: {
          DATACRAZY_API_TOKEN: process.env.DATACRAZY_API_TOKEN ?? 'e2e-test-token',
          TYPEFORM_WEBHOOK_SECRET:
            process.env.TYPEFORM_WEBHOOK_SECRET ?? 'dev-placeholder-secret',
          TYPEFORM_FORM_ID: process.env.TYPEFORM_FORM_ID ?? 'FbFMsO5x',
          NEXT_PUBLIC_TYPEFORM_FORM_ID:
            process.env.NEXT_PUBLIC_TYPEFORM_FORM_ID ?? 'FbFMsO5x',
          NEXT_PUBLIC_SITE_URL:
            process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
        },
      },
});
