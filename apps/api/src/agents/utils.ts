import { randomUUID } from 'crypto';

export function generateId(): string {
  return randomUUID();
}

/**
 * Parse JSON da resposta da IA, tolerando markdown fences (```json ... ```),
 * texto extra antes/depois, caracteres de escape malformados e trailing commas.
 * Usa um algoritmo de reparo simples como fallback para JSON malformado de LLMs.
 */
export function parseAgentJSON<T>(raw: string): T {
  const cleaned = raw
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();

  const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (!match) throw new Error(`Nenhum JSON encontrado na resposta da IA:\n${raw.slice(0, 200)}`);

  const jsonStr = sanitizeJsonString(match[0]);

  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    const repaired = repairJson(jsonStr);
    return JSON.parse(repaired) as T;
  }
}

/**
 * Sanitiza strings JSON para corrigir problemas comuns de LLMs:
 * trailing commas, caracteres de controle não escapados dentro de strings.
 */
function sanitizeJsonString(str: string): string {
  let inString = false;
  let escaped = false;
  let out = '';

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (!inString) {
      if (char === '"') { inString = true; out += char; }
      else out += char;
      continue;
    }
    if (escaped) { out += char; escaped = false; continue; }
    if (char === '\\') { escaped = true; out += char; continue; }
    if (char === '"') { inString = false; out += char; continue; }
    if (char === '\n') { out += '\\n'; continue; }
    if (char === '\r') { out += '\\r'; continue; }
    if (char === '\t') { out += '\\t'; continue; }
    if (char.charCodeAt(0) < 0x20) continue;
    out += char;
  }

  return out.replace(/,\s*([}\]])/g, '$1');
}

/**
 * Repara JSON malformado: balanceia chaves/colchetes, fecha strings não
 * terminadas e remove trailing commas / vírgulas duplicadas.
 */
function repairJson(str: string): string {
  let inString = false;
  let escaped = false;
  let out = '';
  const stack: string[] = [];

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (!inString) {
      if (char === '"') { inString = true; out += char; }
      else if (char === '{' || char === '[') { stack.push(char === '{' ? '}' : ']'); out += char; }
      else if (char === '}' || char === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === char) stack.pop();
        out += char;
      } else out += char;
      continue;
    }
    if (escaped) { out += char; escaped = false; continue; }
    if (char === '\\') { escaped = true; out += char; continue; }
    if (char === '"') { inString = false; out += char; continue; }
    if (char === '\n') out += '\\n';
    else if (char === '\r') out += '\\r';
    else if (char === '\t') out += '\\t';
    else if (char.charCodeAt(0) < 0x20) { /* remove outros controles */ }
    else out += char;
  }

  if (inString) out += '"';
  while (stack.length > 0) out += stack.pop();

  return out.replace(/,\s*([}\]])/g, '$1').replace(/,,+/g, ',');
}