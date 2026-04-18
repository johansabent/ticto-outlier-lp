'use client';
import Script from 'next/script';
import { useEffect, useMemo, useState } from 'react';
import {
  type Attribution,
  collectUtmsFromUrl,
  readStoredAttribution,
  UTM_KEYS,
} from '@/lib/attribution';

// Typeform silently drops hidden fields not declared in the form config.
// Form FbFMsO5x declares exactly 8 hidden fields: 7 UTM keys + landing_page.
// Anything else (e.g. captured_at, persisted locally for audit) must be
// stripped before passing to the embed script.
const HIDDEN_KEYS = [...UTM_KEYS, 'landing_page'] as const;
const TRANSITIVE_SEARCH_PARAMS = UTM_KEYS.join(',');

function readAttributionSnapshot(): Attribution {
  const stored = readStoredAttribution();
  if (stored) return stored;

  const currentUrl = new URL(window.location.href);
  return {
    ...collectUtmsFromUrl(currentUrl),
    landing_page: window.location.href,
  };
}

function toHiddenAttribute(values: Attribution): string | undefined {
  const pairs: string[] = [];

  for (const key of HIDDEN_KEYS) {
    const value = values[key];
    if (typeof value === 'string' && value.length > 0) {
      pairs.push(`${key}=${value.replaceAll(',', '%2C')}`);
    }
  }

  return pairs.length > 0 ? pairs.join(',') : undefined;
}

export function TypeformEmbed({ formId }: { formId: string }) {
  const [attribution, setAttribution] = useState<Attribution | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Syncing localStorage/window.location after hydration; lazy-init would risk server/client markup mismatch.
    setAttribution(readAttributionSnapshot());
  }, []);

  const hidden = useMemo(
    () => (attribution ? toHiddenAttribute(attribution) : undefined),
    [attribution],
  );

  return (
    <div className="space-y-7">
      <div className="border-l-2 border-brand-cyan pl-4">
        <p className="font-tomato text-[32px] leading-[0.95] tracking-normal text-[#061016]">
          Garanta sua participação
        </p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-placeholder)]">
          Preencha seus dados para concorrer ao ingresso do Ebulição.
        </p>
      </div>

      {attribution ? (
        <button
          type="button"
          data-tf-popup={formId}
          data-tf-opacity="100"
          data-tf-hide-headers
          data-tf-size="100"
          data-tf-iframe-props="title=Ticto Test"
          data-tf-transitive-search-params={TRANSITIVE_SEARCH_PARAMS}
          data-tf-medium="snippet"
          data-tf-hidden={hidden}
          className="h-[56px] w-full rounded-[6px] bg-brand-cyan px-5 font-tomato text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#18a9c2] focus:outline-none focus:ring-2 focus:ring-brand-cyan focus:ring-offset-2 focus:ring-offset-bg-white"
        >
          Cadastro 100% gratuito
        </button>
      ) : (
        <div className="h-[56px] w-full animate-pulse rounded-[6px] bg-[#d6f4f8]" />
      )}

      {attribution ? (
        <Script src="https://embed.typeform.com/next/embed.js" strategy="afterInteractive" />
      ) : null}
    </div>
  );
}
