import { describe, it, expect } from 'vitest';
import { parseAnswers, FIELD_REFS, type TypeformAnswer } from '@/lib/typeform-fields';
import fixture from '../fixtures/typeform-webhook.json';

describe('lib/typeform-fields', () => {
  it('FIELD_REFS defines the 5 required fields with correct types', () => {
    expect(FIELD_REFS.nome.type).toBe('text');
    expect(FIELD_REFS.cpf.type).toBe('text');
    expect(FIELD_REFS.email.type).toBe('email');
    expect(FIELD_REFS.telefone.type).toBe('phone_number');
    expect(FIELD_REFS.sells_online.type).toBe('choice');
    expect(FIELD_REFS.nome.required).toBe(true);
  });

  it('parseAnswers extracts all 5 fields from the canonical fixture', () => {
    const answers = fixture.form_response.answers as TypeformAnswer[];
    const out = parseAnswers(answers);
    expect(out.nome).toBe('Teste QA');
    expect(out.cpf).toBe('12345678900');
    expect(out.email).toBe('teste@example.com');
    expect(out.telefone).toBe('+5511900000000');
    expect(out.sells_online).toBe('Sim');
  });

  it('parseAnswers extracts choice by label, not by choice.ref', () => {
    // Include all 5 required fields so the required-field guard does not trip;
    // the assertion below pins the choice-label extraction behavior specifically.
    const answers: TypeformAnswer[] = [
      { type: 'text', text: 'Alguém', field: { ref: 'nome', type: 'short_text' } },
      { type: 'text', text: '00000000000', field: { ref: 'cpf', type: 'short_text' } },
      { type: 'email', email: 'a@b.co', field: { ref: 'email', type: 'email' } },
      { type: 'phone_number', phone_number: '+5500000000000', field: { ref: 'telefone', type: 'phone_number' } },
      { type: 'choice', choice: { label: 'Não', ref: 'some-uuid' }, field: { ref: 'sells_online', type: 'multiple_choice' } },
    ];
    const out = parseAnswers(answers);
    expect(out.sells_online).toBe('Não');
  });

  it('parseAnswers throws when a required field is missing', () => {
    // Drop 'email' from answers. The filter callback's parameter type is
    // left inferred because the JSON import (resolveJsonModule) narrows
    // `type` to `string` per element, which doesn't satisfy the stricter
    // TypeformAnswer union — the runtime shape is unchanged either way.
    const answers = fixture.form_response.answers.filter(
      (a) => a.field.ref !== 'email',
    ) as unknown as TypeformAnswer[];
    expect(() => parseAnswers(answers)).toThrow(/email/);
  });

  it('parseAnswers throws when answers is not an array', () => {
    expect(() => parseAnswers(null as never)).toThrow();
    expect(() => parseAnswers({} as never)).toThrow();
  });

  it('parseAnswers throws when the live Typeform type drifts from the registry', () => {
    // Simulates the Typeform form being edited so the `email` ref is now
    // pointing at a short-text field. parseAnswers must fail fast, not
    // silently accept whatever `answer.text` happens to contain.
    const answers: TypeformAnswer[] = [
      { type: 'text', text: 'Alguém', field: { ref: 'nome', type: 'short_text' } },
      { type: 'text', text: '00000000000', field: { ref: 'cpf', type: 'short_text' } },
      { type: 'text', text: 'not-an-email', field: { ref: 'email', type: 'short_text' } },
      { type: 'phone_number', phone_number: '+5500000000000', field: { ref: 'telefone', type: 'phone_number' } },
      { type: 'choice', choice: { label: 'Sim', ref: 'uuid' }, field: { ref: 'sells_online', type: 'multiple_choice' } },
    ];
    expect(() => parseAnswers(answers)).toThrow(/Type mismatch for Typeform field email/);
  });

  it('parseAnswers skips answers with missing field.ref instead of crashing with TypeError', () => {
    // Malformed Typeform payload: an answer with no field.ref. Without the
    // `a?.field?.ref` guard this would crash with "Cannot read properties of
    // undefined (reading 'ref')" inside the index loop, losing all context.
    const answers: TypeformAnswer[] = [
      { type: 'text', text: 'Alguém', field: { ref: 'nome', type: 'short_text' } },
      { type: 'text', text: '00000000000', field: { ref: 'cpf', type: 'short_text' } },
      { type: 'email', email: 'teste@example.com', field: { ref: 'email', type: 'email' } },
      { type: 'phone_number', phone_number: '+5500000000000', field: { ref: 'telefone', type: 'phone_number' } },
      // Malformed: field is missing entirely. The safer path drops it and
      // then the required-field guard reports the missing `sells_online`.
      { type: 'choice' } as unknown as TypeformAnswer,
    ];
    expect(() => parseAnswers(answers)).toThrow(/Missing required Typeform field: sells_online/);
  });
});
