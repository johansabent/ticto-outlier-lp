import { z } from 'zod';

// Public env validation. Only NEXT_PUBLIC_* vars go here so that client
// components importing this file do not pull server-only var names into
// the client bundle.

const clientSchema = z.object({
  NEXT_PUBLIC_TYPEFORM_FORM_ID: z
    .string()
    .trim()
    .min(1, 'NEXT_PUBLIC_TYPEFORM_FORM_ID is required'),
  NEXT_PUBLIC_SITE_URL: z.string().trim().url('NEXT_PUBLIC_SITE_URL must be a valid URL'),
});

export type ClientEnv = z.infer<typeof clientSchema>;

export function getClientEnv(): ClientEnv {
  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_TYPEFORM_FORM_ID: process.env.NEXT_PUBLIC_TYPEFORM_FORM_ID,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
  if (!parsed.success) {
    throw new Error(
      `Invalid public environment:\n${parsed.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n')}`,
    );
  }
  return parsed.data;
}
