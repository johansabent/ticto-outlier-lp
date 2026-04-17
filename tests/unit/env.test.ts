import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

function reset() {
  for (const k of Object.keys(process.env)) {
    if (!(k in ORIGINAL_ENV)) delete process.env[k];
  }
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) process.env[k] = v;
}

function setValidEnv() {
  process.env.DATACRAZY_API_TOKEN = 'tok_live_123';
  process.env.TYPEFORM_WEBHOOK_SECRET = 'whsec_abcdef_long_enough';
  process.env.TYPEFORM_FORM_ID = 'FbFMsO5x';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://ticto-ebulicao-lp.vercel.app';
  process.env.NEXT_PUBLIC_TYPEFORM_FORM_ID = 'FbFMsO5x';
}

describe('lib/env', () => {
  beforeEach(() => { vi.resetModules(); reset(); });
  afterEach(() => reset());

  it('parses a fully-populated env and exposes typed getters', async () => {
    setValidEnv();
    const { getServerEnv, getClientEnv } = await import('@/lib/env');
    const srv = getServerEnv();
    expect(srv.DATACRAZY_API_TOKEN).toBe('tok_live_123');
    expect(srv.TYPEFORM_WEBHOOK_SECRET).toBe('whsec_abcdef_long_enough');
    expect(srv.TYPEFORM_FORM_ID).toBe('FbFMsO5x');

    const cli = getClientEnv();
    expect(cli.NEXT_PUBLIC_SITE_URL).toBe('https://ticto-ebulicao-lp.vercel.app');
    expect(cli.NEXT_PUBLIC_TYPEFORM_FORM_ID).toBe('FbFMsO5x');
  });

  it('throws when DATACRAZY_API_TOKEN is missing', async () => {
    setValidEnv();
    delete process.env.DATACRAZY_API_TOKEN;
    await expect(import('@/lib/env').then((m) => m.getServerEnv())).rejects.toThrow(
      /DATACRAZY_API_TOKEN/,
    );
  });

  it('throws when TYPEFORM_WEBHOOK_SECRET is missing in production', async () => {
    setValidEnv();
    // Next.js augments process.env.NODE_ENV to a readonly literal union; bypass via Object.assign for the test.
    Object.assign(process.env, { NODE_ENV: 'production' });
    delete process.env.TYPEFORM_WEBHOOK_SECRET;
    await expect(import('@/lib/env').then((m) => m.getServerEnv())).rejects.toThrow(
      /TYPEFORM_WEBHOOK_SECRET/,
    );
  });

  it('throws when TYPEFORM_FORM_ID is missing', async () => {
    setValidEnv();
    delete process.env.TYPEFORM_FORM_ID;
    await expect(import('@/lib/env').then((m) => m.getServerEnv())).rejects.toThrow(
      /TYPEFORM_FORM_ID/,
    );
  });

  it('throws when NEXT_PUBLIC_SITE_URL is not a valid URL', async () => {
    setValidEnv();
    process.env.NEXT_PUBLIC_SITE_URL = 'not a url';
    await expect(import('@/lib/env').then((m) => m.getClientEnv())).rejects.toThrow(
      /NEXT_PUBLIC_SITE_URL/,
    );
  });
});
