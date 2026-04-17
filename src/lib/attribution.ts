import { useState, useEffect } from 'react';

export const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'sck',
  'src',
] as const;

export type UtmKey = (typeof UTM_KEYS)[number];

export type Attribution = Partial<Record<UtmKey, string>> & {
  landing_page?: string;
  captured_at?: string;
};

const STORAGE_KEY = 'first_touch_utms_v1';

function storageAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const probe = '__probe__';
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function collectUtmsFromUrl(url: URL): Partial<Record<UtmKey, string>> {
  const out: Partial<Record<UtmKey, string>> = {};
  for (const k of UTM_KEYS) {
    const v = url.searchParams.get(k);
    if (v) out[k] = v;
  }
  return out;
}

export function readStoredAttribution(): Attribution | null {
  if (!storageAvailable()) return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Attribution;
  } catch {
    return null;
  }
}

export function saveAttribution(
  values: Partial<Record<UtmKey, string>>,
  meta: { landingPath: string; capturedAt: string },
): void {
  if (!storageAvailable()) return;
  const payload: Attribution = { ...values, landing_page: meta.landingPath, captured_at: meta.capturedAt };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function applyStoredToUrl(url: URL, stored: Attribution): boolean {
  let changed = false;
  for (const k of UTM_KEYS) {
    const v = stored[k];
    if (v && !url.searchParams.has(k)) {
      url.searchParams.set(k, v);
      changed = true;
    }
  }
  return changed;
}

export function useAttribution(): { utms: Attribution } {
  const [utms, setUtms] = useState<Attribution>({});
  useEffect(() => {
    // Sync React state from localStorage (external system) post-hydration.
    // Lazy-init via useState would cause a hydration mismatch because
    // readStoredAttribution() returns null on the server and the stored
    // object on the client.
    const stored = readStoredAttribution();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setUtms(stored);
  }, []);
  return { utms };
}
