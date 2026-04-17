'use client';

import { useLayoutEffect } from 'react';
import {
  UTM_KEYS,
  applyStoredToUrl,
  collectUtmsFromUrl,
  readStoredAttribution,
  saveAttribution,
} from '@/lib/attribution';

export function UTMRehydrator() {
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    const capturedAt = new Date().toISOString();

    const fromUrl = collectUtmsFromUrl(url);
    const hasUrlUtms = UTM_KEYS.some((k) => k in fromUrl);

    const stored = readStoredAttribution();

    if (hasUrlUtms && !stored) {
      // Use the full href (pathname + search + hash) so Datacrazy's sourceReferral.sourceUrl
      // and Typeform's landing_page hidden field both carry the real landing URL.
      saveAttribution(fromUrl, { landingPath: window.location.href, capturedAt });
      return;
    }

    // First-touch attribution must also fire for organic visitors with no UTMs,
    // otherwise `landing_page` is never written and the webhook falls back to
    // NEXT_PUBLIC_SITE_URL. Capture the bare landing URL on first visit too.
    if (!hasUrlUtms && !stored) {
      saveAttribution({}, { landingPath: window.location.href, capturedAt });
      return;
    }

    if (!hasUrlUtms && stored) {
      const changed = applyStoredToUrl(url, stored);
      if (changed) {
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, []);

  return null;
}
