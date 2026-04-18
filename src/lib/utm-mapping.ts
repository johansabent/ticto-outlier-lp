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
  if (answers.sells_online) {
    // HubSpot `sells_online` is a booleancheckbox property whose options are
    // {label:"Yes",value:"true"} / {label:"No",value:"false"}. The Typeform
    // side sends the choice label (PT-BR "Sim"/"Não" or EN "Yes"/"No"), so
    // we normalize to the boolean value string HubSpot's schema expects.
    // Unknown labels default to "false" rather than 400-ing the POST.
    const normalized = answers.sells_online.trim().toLowerCase();
    properties.sells_online =
      normalized === 'sim' || normalized === 'yes' ? 'true' : 'false';
  }

  for (const [k, v] of Object.entries(utms)) {
    if (v !== null) (properties as Record<string, string>)[k] = v;
  }

  properties.landing_page = landingUrl;
  // HubSpot `captured_at` is a `date` property (YYYY-MM-DD, UTC midnight).
  // Typeform's `submitted_at` is full ISO-8601 datetime; truncate to the
  // date component. Submission wall-clock time is still retained by HubSpot's
  // automatic `createdate` on the contact record.
  properties.captured_at = capturedAt.slice(0, 10);

  return { properties };
}
