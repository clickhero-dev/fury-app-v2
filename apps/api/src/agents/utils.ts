/**
 * Parse JSON da resposta da IA, tolerando markdown fences (```json ... ```)
 * e texto extra antes/depois do objeto.
 */
export function parseAgentJSON<T>(raw: string): T {
  const cleaned = raw
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
  // Extrai o primeiro objeto/array JSON válido
  const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (!match) throw new Error(`Nenhum JSON encontrado na resposta da IA:\n${raw.slice(0, 200)}`);
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    // Fallback: tenta parsear o raw limpo inteiro
    return JSON.parse(cleaned) as T;
  }
}
