import type { MetaLeadFormQuestion } from '../lib/meta-api.js';

/** Traduz os keys de field_data pelos tipos das perguntas do formulário Meta. */
export function normalizeMetaLeadFields(
  lead: Record<string, unknown>,
  questions: MetaLeadFormQuestion[] = [],
): { name: string | null; email: string | null; phone: string | null; createdAt: string | null } {
  const fields = Array.isArray(lead.field_data) ? lead.field_data as Array<{ name?: string; values?: string[] }> : [];

  const getValue = (questionTypes: string[], fallbackNames: string[]): string | null => {
    const keys = [
      ...questionTypes.map((type) => questions.find((question) => question.type === type)?.key),
      ...fallbackNames,
    ];
    for (const key of keys) {
      const field = fields.find((item) => item.name === key);
      if (typeof field?.values?.[0] === 'string' && field.values[0]) return field.values[0];
    }
    return null;
  };

  return {
    name: getValue(['FULL_NAME', 'FIRST_NAME'], ['full_name', 'first_name']),
    email: getValue(['EMAIL', 'WORK_EMAIL'], ['email']),
    phone: getValue(['PHONE', 'WHATSAPP_NUMBER', 'USER_PROVIDED_PHONE_NUMBER', 'WORK_PHONE_NUMBER'], ['phone_number', 'phone']),
    createdAt: typeof lead.created_time === 'string' ? lead.created_time : null,
  };
}
