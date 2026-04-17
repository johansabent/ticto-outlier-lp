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
    const fromUrl = collectUtmsFromUrl(url);
    const stored = readStoredAttribution();

    // No prior record — set first-touch. Works for both tracked (fromUrl has
    // keys) and organic (fromUrl is empty) visitors; the empty case still
    // writes `landing_page` so the webhook never falls back to NEXT_PUBLIC_SITE_URL
    // for a real visitor. Merged from two branches per round-2 review.
    if (!stored) {
      saveAttribution(fromUrl, {
        landingPath: window.location.href,
        capturedAt: new Date().toISOString(),
      });
      return;
    }

    // Returning visitor with no UTMs in the current URL — rehydrate from
    // storage so in-page share buttons / scroll anchors keep attribution.
    const hasUrlUtms = UTM_KEYS.some((k) => k in fromUrl);
    if (!hasUrlUtms) {
      const changed = applyStoredToUrl(url, stored);
      if (changed) {
        // Preserve Next.js App Router's existing history.state (route tree,
        // scroll position, etc.) rather than clobbering with `{}`. Without
        // this, back/forward navigation and scroll restoration break after
        // the URL rewrite.
        window.history.replaceState(window.history.state, '', url.toString());
      }
    }
  }, []);

  return null;
}
