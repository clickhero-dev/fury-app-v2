/**
 * Parse JSON da resposta da IA, tolerando markdown fences (```json ... ```),
 * texto extra antes/depois, caracteres de escape malformados e trailing commas.
 */
export function parseAgentJSON<T>(raw: string): T {
  // Remove markdown fences
  let cleaned = raw
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();

  // Extrai o primeiro objeto/array JSON válido
  const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (!match) throw new Error(`Nenhum JSON encontrado na resposta da IA:\n${raw.slice(0, 200)}`);

  let jsonStr = match[0];

  // Sanitiza problemas comuns de JSON malformado de LLMs
  jsonStr = sanitizeJsonString(jsonStr);

  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    // Fallback: tenta parsear o raw limpo inteiro sanitizado
    const fallbackStr = sanitizeJsonString(cleaned);
    return JSON.parse(fallbackStr) as T;
  }
}

/**
 * Sanitiza strings JSON para corrigir problemas comuns de LLMs:
 * - Trailing commas antes de } ou ]
 * - Caracteres de controle não escapados dentro de strings
 * - Newlines/tabs não escapados dentro de strings
 * - Aspas não escapadas dentro de strings
 */
function sanitizeJsonString(str: string): string {
  let result = str;

  // Remove trailing commas antes de } ou ]
  result = result.replace(/,\s*([}\]])/g, '$1');

  // Sanitiza conteúdo dentro de strings JSON (entre aspas)
  // Processa caractere por caractere para lidar com escapes corretamente
  let inString = false;
  let escaped = false;
  let out = '';

  for (let i = 0; i < result.length; i++) {
    const char = result[i];
    const next = result[i + 1];

    if (!inString) {
      if (char === '"') {
        inString = true;
        out += char;
      } else {
        out += char;
      }
      continue;
    }

    // Dentro de string
    if (escaped) {
      // Caractere já escapado, mantém
      out += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      out += char;
      continue;
    }

    if (char === '"') {
      inString = false;
      out += char;
      continue;
    }

    // Caracteres de controle não escapados dentro de string
    if (char === '\n') {
      out += '\\n';
      continue;
    }
    if (char === '\r') {
      out += '\\r';
      continue;
    }
    if (char === '\t') {
      out += '\\t';
      continue;
    }
    // Remove outros caracteres de controle (0x00-0x1f exceto \n, \r, \t)
    if (char.charCodeAt(0) < 0x20 && char !== '\n' && char !== '\r' && char !== '\t') {
      // Pula o caractere de controle
      continue;
    }

    out += char;
  }

  return out;
}
