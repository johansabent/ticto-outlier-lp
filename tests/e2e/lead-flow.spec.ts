import { expect, test } from '@playwright/test';
import { createHmac } from 'node:crypto';

// The dev server reads TYPEFORM_WEBHOOK_SECRET from env. We start the dev
// server from `playwright.config.ts` with this exact value, and recompute
// the HMAC here over the same bytes the handler receives — keeps the test
// self-contained and avoids leaking production secrets into CI.
const WEBHOOK_SECRET = 'dev-placeholder-secret';
const HUBSPOT_HOST = 'api.hubapi.com';

const UTM_QUERY =
  'utm_source=linkedin&utm_medium=organic&utm_campaign=ebulicao2026&utm_content=hero-cta&utm_term=raffle&sck=abc123&src=review';

function signBody(rawBody: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
}

function buildTypeformPayload(overrides: Record<string, unknown> = {}) {
  return {
    event_id: '01KPC1H3VJSS9SP8FC4983BD4A',
    event_type: 'form_response',
    form_response: {
      form_id: 'FbFMsO5x',
      token: 'e2e_submission_token',
      landed_at: new Date(Date.now() - 30_000).toISOString(),
      submitted_at: new Date().toISOString(),
      hidden: {
        sck: 'abc123',
        src: 'review',
        utm_campaign: 'ebulicao2026',
        utm_content: 'hero-cta',
        utm_medium: 'organic',
        utm_source: 'linkedin',
        utm_term: 'raffle',
        landing_page: 'http://localhost:3000/?utm_source=linkedin&sck=abc123&src=review',
      },
      answers: [
        { type: 'text', text: 'Teste Playwright', field: { ref: 'nome', type: 'short_text' } },
        { type: 'text', text: '12345678900', field: { ref: 'cpf', type: 'short_text' } },
        {
          type: 'email',
          email: 'qa+playwright@example.com',
          field: { ref: 'email', type: 'email' },
        },
        {
          type: 'phone_number',
          phone_number: '+5511988887777',
          field: { ref: 'telefone', type: 'phone_number' },
        },
        {
          type: 'choice',
          choice: { label: 'Sim', ref: '490ea062-6100-416d-96fa-17e8e8991a4e' },
          field: { ref: 'sells_online', type: 'multiple_choice' },
        },
      ],
      ...overrides,
    },
  };
}

test.describe('Lead flow — E2E', () => {
  test('landing page renders Ebulição branding and the lead-capture card', async ({ page }) => {
    await page.goto('/');

    // Hero
    await expect(page.getByRole('img', { name: 'Ticto' }).first()).toBeVisible();
    await expect(page.getByRole('img', { name: 'Ebulição' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/ebulição/i);

    // Rules
    await expect(page.getByText(/confira as regras/i)).toBeVisible();
    await expect(page.getByText(/crie sua conta no formulário/i)).toBeVisible();

    // Form card
    await expect(page.getByText('CADASTRO 100% GRATUITO', { exact: true })).toBeVisible();
    await expect(page.locator('[data-tf-popup="FbFMsO5x"]')).toBeVisible();

    // Footer — presence of legal copy is a robust anchor
    await expect(page.locator('#politicas-termos')).toBeVisible();
  });

  test('UTMRehydrator persists first-touch params to localStorage', async ({ page }) => {
    await page.goto(`/?${UTM_QUERY}`);

    // UTMRehydrator runs in a useLayoutEffect — poll until the write lands so
    // we are not racing React's first effect tick.
    const stored = await page.waitForFunction(
      () => window.localStorage.getItem('first_touch_utms_v1'),
      null,
      { timeout: 5_000 },
    );
    const value = (await stored.jsonValue()) as string;

    const parsed = JSON.parse(value) as Record<string, string>;
    expect(parsed.utm_source).toBe('linkedin');
    expect(parsed.utm_medium).toBe('organic');
    expect(parsed.utm_campaign).toBe('ebulicao2026');
    expect(parsed.utm_content).toBe('hero-cta');
    expect(parsed.utm_term).toBe('raffle');
    expect(parsed.sck).toBe('abc123');
    expect(parsed.src).toBe('review');
    expect(parsed.landing_page).toContain(UTM_QUERY);

    const popupButton = page.locator('[data-tf-popup="FbFMsO5x"]');
    await expect(popupButton).toHaveAttribute('data-tf-hidden', /utm_source=linkedin/);
    await expect(popupButton).toHaveAttribute('data-tf-hidden', /utm_medium=organic/);
    await expect(popupButton).toHaveAttribute('data-tf-hidden', /utm_campaign=ebulicao2026/);
    await expect(popupButton).toHaveAttribute('data-tf-hidden', /sck=abc123/);
    await expect(popupButton).toHaveAttribute('data-tf-hidden', /src=review/);
    await expect(popupButton).toHaveAttribute('data-tf-hidden', /landing_page=http/);
  });

  test('/api/lead rejects payloads with missing HMAC signature (401)', async ({ request }) => {
    const body = JSON.stringify(buildTypeformPayload());
    // No `typeform-signature` header — handler must reject before doing any work.
    const res = await request.post('/api/lead', {
      headers: { 'content-type': 'application/json' },
      data: body,
    });
    expect(res.status()).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('unauthorized');
  });

  test('/api/lead rejects payloads with a forged HMAC signature (401)', async ({ request }) => {
    const body = JSON.stringify(buildTypeformPayload());
    const forged = signBody(body, 'not-the-real-secret-but-long-enough-for-min-check');
    const res = await request.post('/api/lead', {
      headers: { 'content-type': 'application/json', 'typeform-signature': forged },
      data: body,
    });
    expect(res.status()).toBe(401);
  });

  test('/api/lead rejects correctly-signed payloads from an unexpected form (403)', async ({
    request,
  }) => {
    test.skip(
      !!process.env.PLAYWRIGHT_TEST_BASE_URL,
      'Signed-payload test requires deterministic local webServer env; skip against remote deployments.',
    );
    const body = JSON.stringify(buildTypeformPayload({ form_id: 'wrong-form-id' }));
    const signature = signBody(body, WEBHOOK_SECRET);
    const res = await request.post('/api/lead', {
      headers: {
        'content-type': 'application/json',
        'typeform-signature': signature,
      },
      data: body,
    });
    expect(res.status()).toBe(403);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe('unexpected_form_id');
  });

  test('/api/lead accepts a correctly-signed payload and attempts CRM forwarding', async ({
    page,
    request,
  }) => {
    // Skip when running against a remote deployment (Vercel Preview/Prod).
    // Remote envs use the real TYPEFORM_WEBHOOK_SECRET, not the hardcoded
    // 'dev-placeholder-secret' that this test signs with — HMAC would mismatch
    // and the handler would return 401, not the 500 we assert. We can't ship
    // the real secret into CI, so this test is local-env-only. The negative
    // auth-rejection tests above still run against Preview and cover the
    // handler's HMAC verification path end-to-end.
    test.skip(
      !!process.env.PLAYWRIGHT_TEST_BASE_URL,
      'Signed-payload test requires deterministic local webServer env; skip against remote deployments.',
    );
    // Install a Playwright route mock for HubSpot on the browser context.
    // NOTE (deviation from plan): this mock only catches requests issued from
    // the browser process. The actual `/api/lead` handler runs inside the
    // Next.js server and calls HubSpot via Node's global fetch, which
    // Playwright cannot intercept. The mock is kept installed (a) to document
    // intent, and (b) so that any accidental browser-originated call to
    // `/crm/v3/objects/contacts` would also be stopped in a deterministic way.
    // Shape assertions on the outbound HubSpot body are already covered in the
    // unit suite (`tests/unit/utm-mapping.test.ts`, `tests/unit/hubspot.test.ts`).
    const crmHits: { url: string; body: unknown }[] = [];
    await page.route(`**://${HUBSPOT_HOST}/**`, async (route) => {
      const req = route.request();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(req.postData() ?? '{}');
      } catch {
        parsed = req.postData();
      }
      crmHits.push({ url: req.url(), body: parsed });
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'mock_lead_42' }),
      });
    });

    const body = JSON.stringify(buildTypeformPayload());
    const signature = signBody(body, WEBHOOK_SECRET);

    const res = await request.post('/api/lead', {
      headers: {
        'content-type': 'application/json',
        'typeform-signature': signature,
      },
      data: body,
    });

    // The playwright.config.ts webServer forces HUBSPOT_PRIVATE_APP_TOKEN to
    // the deterministic literal 'e2e-test-token'. HubSpot rejects that token
    // with 401, so the outbound POST returns a non-2xx, and our handler maps
    // that to 500 { error: 'crm_failed' }. A 500 here proves the full handler
    // pipeline ran past HMAC verification, JSON parse, parseAnswers, mapUtms,
    // buildHubspotContactPayload, and into postLead. Because env is
    // forced-deterministic, we can assert the exact 500 status.
    expect(res.status()).toBe(500);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe('crm_failed');
  });
});
