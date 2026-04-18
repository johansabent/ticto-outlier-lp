import { z } from 'zod';

// Server-only env validation. Never import this module from a client component —
// doing so bundles the server-only var names (DATACRAZY_API_TOKEN,
// TYPEFORM_WEBHOOK_SECRET, TYPEFORM_FORM_ID) into the client JS, and
// `pnpm check:secrets` will flag it. Public env access lives in `env.client.ts`.

// `.default(...)` on a Zod optional fires only when the input is `undefined`.
// Empty-string env values (common when `.env.example` is copied verbatim) would
// otherwise fall through to `.min(16)` and throw in non-prod. Preprocess first.
const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

function buildServerSchema(isProduction: boolean) {
  return z.object({
    DATACRAZY_API_TOKEN: z.string().trim().min(1, 'DATACRAZY_API_TOKEN is required'),
    DATACRAZY_LEADS_ENDPOINT: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .url('DATACRAZY_LEADS_ENDPOINT must be an https URL')
        .refine((u) => u.startsWith('https://'), {
          message: 'DATACRAZY_LEADS_ENDPOINT must use https',
        })
        .optional()
        .default('https://api.g1.datacrazy.io/api/v1/leads'),
    ),
    TYPEFORM_WEBHOOK_SECRET: z.preprocess(
      emptyToUndefined,
      isProduction
        ? z
            .string()
            .trim()
            .min(16, 'TYPEFORM_WEBHOOK_SECRET must be at least 16 chars in production')
        : z.string().trim().min(1).optional().default('dev-placeholder-secret'),
    ),
    TYPEFORM_FORM_ID: z.string().trim().min(1, 'TYPEFORM_FORM_ID is required'),
  });
}

export type ServerEnv = z.infer<ReturnType<typeof buildServerSchema>>;

export function getServerEnv(): ServerEnv {
  const isProduction = process.env.NODE_ENV === 'production';
  const parsed = buildServerSchema(isProduction).safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment:\n${parsed.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n')}`,
    );
  }
  return parsed.data;
}
