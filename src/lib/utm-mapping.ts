import type { AnswerByRef } from '@/lib/typeform-fields';

export interface UtmValues {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  sck: string | null;
  src: string | null;
}

export interface DatacrazyLeadPayload {
  name: string;
  email: string;
  phone: string;
  source: string;
  sourceReferral: { sourceUrl: string };
  notes: string;
}

// Simpler than YayForms — UTMs live in one flat object (form_response.hidden)
export function mapUtms(hidden: Record<string, string> | undefined | null): UtmValues {
  const h = hidden ?? {};
  return {
    utm_source:   h.utm_source   ?? null,
    utm_medium:   h.utm_medium   ?? null,
    utm_campaign: h.utm_campaign ?? null,
    utm_content:  h.utm_content  ?? null,
    utm_term:     h.utm_term     ?? null,
    sck:          h.sck          ?? null,
    src:          h.src          ?? null,
  };
}

export function buildDatacrazyPayload(ctx: {
  answers: AnswerByRef;
  utms: UtmValues;
  landingUrl: string;
  capturedAt: string;
}): DatacrazyLeadPayload {
  const { answers, utms, landingUrl, capturedAt } = ctx;

  // notes-JSON: all 7 UTM values (omit nulls) + metadata
  const notesObj: Record<string, string> = {};
  for (const [k, v] of Object.entries(utms)) {
    if (v !== null) notesObj[k] = v;
  }
  notesObj.landing_page = landingUrl;
  notesObj.captured_at = capturedAt;

  return {
    name: answers.nome,
    email: answers.email,
    phone: answers.telefone,
    source: utms.utm_source ?? 'direct',
    sourceReferral: { sourceUrl: landingUrl },
    notes: JSON.stringify(notesObj),
    // No tags — Datacrazy tags is a rejected decision (spec explicitly rejected it)
  };
}
