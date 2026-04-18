import { describe, it, expect } from 'vitest';
import { mapUtms, buildHubspotContactPayload } from '@/lib/utm-mapping';
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

describe('lib/utm-mapping — buildHubspotContactPayload', () => {
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

  it('maps to HubSpot Contacts v3 payload', () => {
    const out = buildHubspotContactPayload({ answers, utms, landingUrl, capturedAt: '2026-04-16T21:00:39Z' });
    expect(out.properties.firstname).toBe('João Silva');
    expect(out.properties.email).toBe('joao@example.com');
    expect(out.properties.phone).toBe('+5511999998888');
    expect(out.properties.cpf).toBe('12345678900');
    expect(out.properties.sells_online).toBe('Sim');
    expect(out.properties.utm_source).toBe('linkedin');
    expect(out.properties.sck).toBe('abc123');
    expect(out.properties.src).toBe('review');
    expect(out.properties.landing_page).toBe(landingUrl);
    expect(out.properties.captured_at).toBe('2026-04-16T21:00:39Z');
  });

  it('omits utm_source from properties when it is null', () => {
    const out = buildHubspotContactPayload({
      answers,
      utms: { ...utms, utm_source: null },
      landingUrl: 'https://ex.com/',
      capturedAt: '2026-04-16T21:00:00Z',
    });
    expect(out.properties.utm_source).toBeUndefined();
  });

  it('does not emit a tags field on any level', () => {
    const out = buildHubspotContactPayload({ answers, utms, landingUrl, capturedAt: '2026-04-16T21:00:00Z' });
    expect((out as { tags?: unknown }).tags).toBeUndefined();
    expect((out.properties as { tags?: unknown }).tags).toBeUndefined();
  });

  it('has exactly one top-level key: properties', () => {
    const out = buildHubspotContactPayload({ answers, utms, landingUrl, capturedAt: '2026-04-16T21:00:00Z' });
    expect(Object.keys(out)).toEqual(['properties']);
  });
});
