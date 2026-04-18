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

export interface HubspotContactPayload {
  properties: {
    email: string;
    firstname: string;
    phone: string;
    cpf?: string;
    sells_online?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
    sck?: string;
    src?: string;
    landing_page?: string;
    captured_at?: string;
  };
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

export function buildHubspotContactPayload(ctx: {
  answers: AnswerByRef;
  utms: UtmValues;
  landingUrl: string;
  capturedAt: string;
}): HubspotContactPayload {
  const { answers, utms, landingUrl, capturedAt } = ctx;

  const properties: HubspotContactPayload['properties'] = {
    email: answers.email,
    firstname: answers.nome,
    phone: answers.telefone,
  };

  if (answers.cpf) properties.cpf = answers.cpf;
  if (answers.sells_online) properties.sells_online = answers.sells_online;

  for (const [k, v] of Object.entries(utms)) {
    if (v !== null) (properties as Record<string, string>)[k] = v;
  }

  properties.landing_page = landingUrl;
  properties.captured_at = capturedAt;

  return { properties };
}
