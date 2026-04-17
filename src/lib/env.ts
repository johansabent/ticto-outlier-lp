import { z } from 'zod';

// TYPEFORM_WEBHOOK_SECRET: required in production, optional in test/dev
const isProduction = process.env.NODE_ENV === 'production';

const serverSchema = z.object({
  DATACRAZY_API_TOKEN: z.string().min(1, 'DATACRAZY_API_TOKEN is required'),
  TYPEFORM_WEBHOOK_SECRET: isProduction
    ? z.string().min(16, 'TYPEFORM_WEBHOOK_SECRET must be at least 16 chars in production')
    : z.string().min(1).optional().default('dev-placeholder-secret'),
  TYPEFORM_FORM_ID: z.string().min(1, 'TYPEFORM_FORM_ID is required'),
});

const clientSchema = z.object({
  NEXT_PUBLIC_TYPEFORM_FORM_ID: z.string().min(1, 'NEXT_PUBLIC_TYPEFORM_FORM_ID is required'),
  NEXT_PUBLIC_SITE_URL: z.string().url('NEXT_PUBLIC_SITE_URL must be a valid URL'),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;

export function getServerEnv(): ServerEnv {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment:\n${parsed.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n')}`,
    );
  }
  return parsed.data;
}

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
