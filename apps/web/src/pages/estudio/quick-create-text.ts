export type TextChoice = 'auto' | 'explicit' | 'none';

/** Mantém o marcador consumido pela revisão de texto da API. */
export function applyTextChoice(prompt: string, choice: TextChoice, text: string): string {
  if (choice === 'auto') return prompt;
  const headline = text.trim();
  if (choice === 'explicit' && (!headline || /["\n\r]/.test(headline))) throw new Error('Informe uma frase sem aspas ou quebras de linha.');
  const scene = prompt.replace(/\n?Texto na imagem \(único texto, escrito exatamente assim\): "[^"\n]*"/g, '')
    .replace(/\n?Não escreva nenhum texto na imagem\./g, '').trim();
  const instruction = choice === 'none' ? 'Não escreva nenhum texto na imagem.' : `Texto na imagem (único texto, escrito exatamente assim): "${headline}"`;
  return `${scene.slice(0, 999 - instruction.length).trimEnd()}\n${instruction}`;
}
