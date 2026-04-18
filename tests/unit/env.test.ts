import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

function reset() {
  for (const k of Object.keys(process.env)) {
    if (!(k in ORIGINAL_ENV)) delete process.env[k];
  }
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) process.env[k] = v;
}

function setValidEnv() {
  process.env.HUBSPOT_PRIVATE_APP_TOKEN = 'tok_live_123';
  process.env.TYPEFORM_WEBHOOK_SECRET = 'whsec_abcdef_long_enough';
  process.env.TYPEFORM_FORM_ID = 'FbFMsO5x';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://ticto-ebulicao-lp.vercel.app';
  process.env.NEXT_PUBLIC_TYPEFORM_FORM_ID = 'FbFMsO5x';
}

describe('lib/env.server', () => {
  beforeEach(() => reset());
  afterEach(() => reset());

  it('parses a fully-populated server env and exposes typed getters', async () => {
    setValidEnv();
    const { getServerEnv } = await import('@/lib/env.server');
    const srv = getServerEnv();
    expect(srv.HUBSPOT_PRIVATE_APP_TOKEN).toBe('tok_live_123');
    expect(srv.TYPEFORM_WEBHOOK_SECRET).toBe('whsec_abcdef_long_enough');
    expect(srv.TYPEFORM_FORM_ID).toBe('FbFMsO5x');
  });

  it('throws when HUBSPOT_PRIVATE_APP_TOKEN is missing', async () => {
    setValidEnv();
    delete process.env.HUBSPOT_PRIVATE_APP_TOKEN;
    const { getServerEnv } = await import('@/lib/env.server');
    expect(() => getServerEnv()).toThrow(/HUBSPOT_PRIVATE_APP_TOKEN/);
  });

  it('throws when TYPEFORM_WEBHOOK_SECRET is missing in production', async () => {
    setValidEnv();
    // Next.js augments process.env.NODE_ENV to a readonly literal union; bypass via Object.assign for the test.
    Object.assign(process.env, { NODE_ENV: 'production' });
    delete process.env.TYPEFORM_WEBHOOK_SECRET;
    const { getServerEnv } = await import('@/lib/env.server');
    expect(() => getServerEnv()).toThrow(/TYPEFORM_WEBHOOK_SECRET/);
  });

  it('falls back to placeholder in dev when TYPEFORM_WEBHOOK_SECRET is empty string', async () => {
    setValidEnv();
    // Simulate an unfilled `.env.local` copied from `.env.example` (the var exists, value is "").
    process.env.TYPEFORM_WEBHOOK_SECRET = '';
    const { getServerEnv } = await import('@/lib/env.server');
    const srv = getServerEnv();
    expect(srv.TYPEFORM_WEBHOOK_SECRET).toBe('dev-placeholder-secret');
  });

  it('throws when TYPEFORM_FORM_ID is missing', async () => {
    setValidEnv();
    delete process.env.TYPEFORM_FORM_ID;
    const { getServerEnv } = await import('@/lib/env.server');
    expect(() => getServerEnv()).toThrow(/TYPEFORM_FORM_ID/);
  });
});

describe('lib/env.client', () => {
  beforeEach(() => reset());
  afterEach(() => reset());

  it('parses a fully-populated public env', async () => {
    setValidEnv();
    const { getClientEnv } = await import('@/lib/env.client');
    const cli = getClientEnv();
    expect(cli.NEXT_PUBLIC_SITE_URL).toBe('https://ticto-ebulicao-lp.vercel.app');
    expect(cli.NEXT_PUBLIC_TYPEFORM_FORM_ID).toBe('FbFMsO5x');
  });

  it('throws when NEXT_PUBLIC_SITE_URL is not a valid URL', async () => {
    setValidEnv();
    process.env.NEXT_PUBLIC_SITE_URL = 'not a url';
    const { getClientEnv } = await import('@/lib/env.client');
    expect(() => getClientEnv()).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });
});
