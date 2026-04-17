'use client';
import { Widget } from '@typeform/embed-react';
import { useAttribution, UTM_KEYS } from '@/lib/attribution';

// Typeform silently drops hidden fields not declared in the form config.
// Form FbFMsO5x declares exactly 8 hidden fields: 7 UTM keys + landing_page.
// Anything else (e.g. captured_at — persisted locally for audit) must be
// stripped before passing to <Widget>.
const HIDDEN_KEYS = [...UTM_KEYS, 'landing_page'] as const;

export function TypeformEmbed({ formId }: { formId: string }) {
  const { utms } = useAttribution();
  const hidden: Record<string, string> = {};
  for (const k of HIDDEN_KEYS) {
    const v = utms[k];
    if (typeof v === 'string' && v.length > 0) hidden[k] = v;
  }
  return (
    <Widget
      id={formId}
      hidden={hidden}
      inlineOnMobile
      opacity={0}
      className="w-full h-[600px]"
    />
  );
}
