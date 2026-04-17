export type ErrorClass =
  | 'auth_invalid'
  | 'parse_error'
  | 'field_map_incomplete'
  | 'datacrazy_4xx'
  | 'datacrazy_5xx'
  | 'datacrazy_timeout';

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
      datacrazy_status: number;
      datacrazy_lead_id: string | number | null;
      timing_ms: number;
    }
  | {
      event: 'lead.failed';
      request_id?: string;
      submission_id?: string | undefined;
      error_class: ErrorClass;
      error_message: string;
    };

export function redactEmail(raw: string): string {
  if (!raw) return '';
  const at = raw.indexOf('@');
  if (at < 1) return '***';
  return `${raw[0]}***${raw.slice(at)}`;
}

export function redactPhone(raw: string): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 1) return '***';
  const tail = digits.slice(-4).padStart(4, digits);
  return `***-${tail}`;
}

function write(level: 'info' | 'warn' | 'error', evt: LeadEvent): void {
  console.log(
    JSON.stringify({
      level,
      ts: new Date().toISOString(),
      ...evt,
    }),
  );
}

export const logger = {
  info: (evt: LeadEvent) => write('info', evt),
  warn: (evt: LeadEvent) => write('warn', evt),
  error: (evt: LeadEvent) => write('error', evt),
};
