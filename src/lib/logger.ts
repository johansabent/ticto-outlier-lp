export type ErrorClass =
  | 'auth_invalid'
  | 'form_id_mismatch'
  | 'parse_error'
  | 'field_map_incomplete'
  | 'hubspot_4xx'
  | 'hubspot_5xx'
  | 'hubspot_timeout';

export type LeadEvent =
  | {
      event: 'lead.received';
      request_id: string;
      auth_mode: 'hmac';
      auth_valid: boolean;
      timing_ms: number;
    }
  | {
      event: 'lead.mapped';
      request_id: string;
      submission_id: string | undefined;
      field_count_mapped: number;
      utm_keys_present: string[];
    }
  | {
      event: 'lead.forwarded';
      request_id: string;
      submission_id: string | undefined;
      hubspot_status: number;
      hubspot_contact_id: string | null;
      timing_ms: number;
      // PII-redacted hints per AGENTS.md Core Invariant: masked-only, never
      // the full email/phone/name. Full values are already in HubSpot;
      // logs get shape-preserving placeholders for observability.
      email_hint: string;
      phone_hint: string;
      name_hint: string;
    }
  | {
      event: 'lead.failed';
      request_id?: string;
      submission_id?: string | undefined;
      error_class: ErrorClass;
      error_message: string;
    };

export function redactEmail(raw: string): string {
  const input = (raw ?? '').trim();
  if (!input) return '';
  const at = input.indexOf('@');
  if (at < 1) return '***';
  return `${input[0]}***${input.slice(at)}`;
}

export function redactName(raw: string): string {
  // Matches the email redaction shape (`j***@domain.com`): first char + `***`.
  // Previous `${firstName} ***` pattern leaked the full first name and — for
  // single-word `nome` submissions — the entire name.
  const s = (raw ?? '').trim();
  if (!s) return '';
  return `${s[0]}***`;
}

export function redactPhone(raw: string): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 1) return '***';
  // AGENTS.md Core Invariant pins the canonical mask format at `***-1234`
  // (four visible characters after the dash). For short inputs we emit
  // `***-****` rather than the actual partial digits — this keeps the
  // fixed shape and avoids leaking a full short attacker-supplied value.
  if (digits.length < 4) return '***-****';
  return `***-${digits.slice(-4)}`;
}

function write(level: 'info' | 'warn' | 'error', evt: LeadEvent): void {
  const payload = JSON.stringify({
    level,
    ts: new Date().toISOString(),
    ...evt,
  });
  // Route each level to its matching console method so log aggregators that
  // split stdout/stderr classify severity correctly even when they ignore
  // the JSON payload.
  if (level === 'error') console.error(payload);
  else if (level === 'warn') console.warn(payload);
  else console.log(payload);
}

export const logger = {
  info: (evt: LeadEvent) => write('info', evt),
  warn: (evt: LeadEvent) => write('warn', evt),
  error: (evt: LeadEvent) => write('error', evt),
};
