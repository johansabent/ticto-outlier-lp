// Field ref registry — keyed by stable ref, not by Typeform field ID (which can change)
export const FIELD_REFS = {
  nome:         { type: 'text' as const,         required: true },
  cpf:          { type: 'text' as const,         required: true },
  email:        { type: 'email' as const,        required: true },
  telefone:     { type: 'phone_number' as const, required: true },
  sells_online: { type: 'choice' as const,       required: true },
} as const;

export type TypeformAnswer = {
  type: 'text' | 'email' | 'phone_number' | 'choice';
  field: { ref: string; type: string; id?: string };
  text?: string;
  email?: string;
  phone_number?: string;
  choice?: { label: string; ref: string };
};

export type AnswerByRef = {
  nome: string;
  cpf: string;
  email: string;
  telefone: string;
  sells_online: string; // choice.label (human-readable)
};

function extractValue(answer: TypeformAnswer): string | undefined {
  switch (answer.type) {
    case 'text':         return answer.text;
    case 'email':        return answer.email;
    case 'phone_number': return answer.phone_number;
    case 'choice':       return answer.choice?.label;
    default:             return undefined;
  }
}

export function parseAnswers(answers: TypeformAnswer[]): AnswerByRef {
  if (!Array.isArray(answers)) {
    throw new TypeError('Typeform answers must be an array');
  }

  // Index answers by field.ref. Skip malformed answers (missing field.ref) —
  // they'll be reported downstream as the matching "Missing required" error
  // with the semantic ref name instead of a raw TypeError on property access.
  const byRef = new Map<string, TypeformAnswer>();
  for (const a of answers) {
    if (!a?.field?.ref) continue;
    byRef.set(a.field.ref, a);
  }

  const result: Partial<AnswerByRef> = {};
  for (const [ref, meta] of Object.entries(FIELD_REFS)) {
    const answer = byRef.get(ref);
    if (!answer) {
      if (meta.required) {
        throw new Error(`Missing required Typeform field: ${ref}`);
      }
      continue;
    }
    // Guard against Typeform form drift: if the form is edited so a ref now
    // points to a different field kind (e.g. the `email` ref becomes a
    // short-text question), the registry's declared type stops matching the
    // live payload. Fail fast instead of silently extracting the wrong value.
    if (answer.type !== meta.type) {
      throw new Error(
        `Type mismatch for Typeform field ${ref}: expected ${meta.type}, got ${answer.type}`,
      );
    }
    const value = extractValue(answer);
    if (!value && meta.required) {
      throw new Error(`Empty value for required Typeform field: ${ref} (type: ${answer.type})`);
    }
    if (value) {
      (result as Record<string, string>)[ref] = value;
    }
  }

  return result as AnswerByRef;
}
