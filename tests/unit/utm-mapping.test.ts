import { describe, it, expect } from 'vitest';
import { mapUtms, buildDatacrazyPayload } from '@/lib/utm-mapping';
import fixture from '../fixtures/typeform-webhook.json';

describe('lib/utm-mapping — mapUtms', () => {
  it('extracts all 7 UTM keys from form_response.hidden', () => {
    const utms = mapUtms(fixture.form_response.hidden);
    expect(utms.utm_source).toBe('google');
    expect(utms.utm_medium).toBe('cpc');
    expect(utms.utm_campaign).toBe('test');
    expect(utms.utm_content).toBe('banner');
    expect(utms.utm_term).toBe('ai');
    expect(utms.sck).toBe('testclick');
    expect(utms.src).toBe('lp');
  });

  it('returns null for missing keys', () => {
    const utms = mapUtms({});
    expect(utms.utm_source).toBeNull();
    expect(utms.sck).toBeNull();
  });

  it('handles missing hidden object gracefully', () => {
    const utms = mapUtms(undefined);
    expect(utms.utm_source).toBeNull();
  });
});

describe('lib/utm-mapping — buildDatacrazyPayload', () => {
  const answers = {
    nome: 'João Silva',
    cpf: '12345678900',
    email: 'joao@example.com',
    telefone: '+5511999998888',
    sells_online: 'Sim',
  };
  const utms = {
    utm_source: 'linkedin',
    utm_medium: 'organic',
    utm_campaign: 'ebulicao2026',
    utm_content: 'hero-cta',
    utm_term: 'evento',
    sck: 'abc123',
    src: 'review',
  };
  const landingUrl = 'https://ticto-ebulicao-lp.vercel.app/?utm_source=linkedin&sck=abc123';

  it('maps to 3-layer Datacrazy payload', () => {
    const out = buildDatacrazyPayload({ answers, utms, landingUrl, capturedAt: '2026-04-16T21:00:39Z' });
    expect(out.name).toBe('João Silva');
    expect(out.email).toBe('joao@example.com');
    expect(out.phone).toBe('+5511999998888');
    expect(out.source).toBe('linkedin');
    expect(out.sourceReferral.sourceUrl).toBe(landingUrl);
    const notes = JSON.parse(out.notes);
    expect(notes.utm_source).toBe('linkedin');
    expect(notes.sck).toBe('abc123');
    expect(notes.src).toBe('review');
    expect(notes.landing_page).toBe(landingUrl);
    expect(notes.captured_at).toBe('2026-04-16T21:00:39Z');
  });

  it('falls back source to "direct" when utm_source is null', () => {
    const out = buildDatacrazyPayload({
      answers,
      utms: { ...utms, utm_source: null },
      landingUrl: 'https://ex.com/',
      capturedAt: '2026-04-16T21:00:00Z',
    });
    expect(out.source).toBe('direct');
  });

  it('does not emit a tags field (3-layer mapping only)', () => {
    const out = buildDatacrazyPayload({ answers, utms, landingUrl, capturedAt: '2026-04-16T21:00:00Z' });
    expect((out as { tags?: unknown }).tags).toBeUndefined();
  });

  it('does not emit sourceReferral.sourceId', () => {
    const out = buildDatacrazyPayload({ answers, utms, landingUrl, capturedAt: '2026-04-16T21:00:00Z' });
    expect((out.sourceReferral as Record<string, unknown>).sourceId).toBeUndefined();
  });
});
