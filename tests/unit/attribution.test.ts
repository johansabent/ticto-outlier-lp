import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  UTM_KEYS,
  readStoredAttribution,
  saveAttribution,
  collectUtmsFromUrl,
  applyStoredToUrl,
} from '@/lib/attribution';

const STORAGE_KEY = 'first_touch_utms_v1';

describe('lib/attribution', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('UTM_KEYS lists exactly the 7 tracking params', () => {
    expect([...UTM_KEYS].sort()).toEqual(
      ['sck', 'src', 'utm_campaign', 'utm_content', 'utm_medium', 'utm_source', 'utm_term'].sort(),
    );
  });

  it('collectUtmsFromUrl picks up present keys and skips absent ones', () => {
    const url = new URL('https://ex.com/?utm_source=li&utm_medium=org&sck=a');
    expect(collectUtmsFromUrl(url)).toEqual({ utm_source: 'li', utm_medium: 'org', sck: 'a' });
  });

  it('saveAttribution writes JSON with landing_page and captured_at', () => {
    saveAttribution(
      { utm_source: 'li', sck: 'a' },
      { landingPath: '/outlier', capturedAt: '2026-04-15T10:00:00Z' },
    );
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.utm_source).toBe('li');
    expect(parsed.landing_page).toBe('/outlier');
    expect(parsed.captured_at).toBe('2026-04-15T10:00:00Z');
  });

  it('readStoredAttribution returns null when nothing saved', () => {
    expect(readStoredAttribution()).toBeNull();
  });

  it('readStoredAttribution returns null on malformed JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(readStoredAttribution()).toBeNull();
  });

  it('applyStoredToUrl fills in only missing keys and reports whether it changed the URL', () => {
    const saved = { utm_source: 'li', utm_medium: 'org' };
    const url = new URL('https://ex.com/?utm_source=direct');
    const changed = applyStoredToUrl(url, saved);
    expect(changed).toBe(true);
    expect(url.searchParams.get('utm_source')).toBe('direct'); // existing key untouched
    expect(url.searchParams.get('utm_medium')).toBe('org');
  });

  it('applyStoredToUrl returns false when nothing to add', () => {
    const saved = { utm_source: 'li' };
    const url = new URL('https://ex.com/?utm_source=li');
    expect(applyStoredToUrl(url, saved)).toBe(false);
  });
});
