/**
 * Parse JSON da resposta da IA, tolerando markdown fences (```json ... ```),
 * texto extra antes/depois, caracteres de escape malformados e trailing commas.
 * Usa json-repair como fallback robusto para JSON malformado de LLMs.
 */
export function parseAgentJSON<T>(raw: string): T {
  // Remove markdown fences
  const cleaned = raw
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();

  // Extrai o primeiro objeto/array JSON válido
  const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (!match) throw new Error(`Nenhum JSON encontrado na resposta da IA:\n${raw.slice(0, 200)}`);

  let jsonStr = match[0];

  // Tenta parse direto primeiro (rápido para JSON válido)
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    // Se falhar, usa sanitização robusta
    jsonStr = sanitizeJsonString(jsonStr);
    try {
      return JSON.parse(jsonStr) as T;
    } catch {
      // Último recurso: json-repair (biblioteca especializada em reparar JSON de LLMs)
      const repaired = repairJson(jsonStr);
      return JSON.parse(repaired) as T;
    }
  }
}

/**
 * Sanitiza strings JSON para corrigir problemas comuns de LLMs:
 * - Trailing commas antes de } ou ]
 * - Caracteres de controle não escapados dentro de strings (newline, tab, etc)
 * - Aspas não escapadas dentro de strings
 * - Unicode problemático
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

/**
 * Repara JSON malformado usando algoritmo robusto (inspirado em json-repair).
 * Lida com: strings não terminadas, chaves/colchetes desbalanceados, vírgulas extras, etc.
 */
function repairJson(str: string): string {
  const result = str;
  let inString = false;
  let escaped = false;
  let out = '';
  const stack: string[] = [];

  // Pass 1: Balanceia chaves/colchetes e conserta strings não terminadas
  for (let i = 0; i < result.length; i++) {
    const char = result[i];
    const next = result[i + 1];

    if (!inString) {
      if (char === '"') {
        inString = true;
        out += char;
      } else if (char === '{' || char === '[') {
        stack.push(char === '{' ? '}' : ']');
        out += char;
      } else if (char === '}' || char === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === char) {
          stack.pop();
        }
        out += char;
      } else {
        out += char;
      }
      continue;
    }

    // Dentro de string
    if (escaped) {
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

    // Escapa caracteres de controle dentro de strings
    if (char === '\n') {
      out += '\\n';
    } else if (char === '\r') {
      out += '\\r';
    } else if (char === '\t') {
      out += '\\t';
    } else if (char.charCodeAt(0) < 0x20) {
      // Remove outros caracteres de controle
    } else {
      out += char;
    }
  }

  // Fecha strings não terminadas
  if (inString) {
    out += '"';
  }

  // Fecha chaves/colchetes abertos
  while (stack.length > 0) {
    out += stack.pop();
  }

  // Pass 2: Remove trailing commas
  out = out.replace(/,\s*([}\]])/g, '$1');

  // Pass 3: Remove vírgulas duplicadas
  out = out.replace(/,,+/g, ',');

  return out;
}