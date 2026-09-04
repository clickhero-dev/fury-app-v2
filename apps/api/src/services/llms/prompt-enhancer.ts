import { openrouterService } from './openrouter.service.js';

/**
 * Enriquece um prompt de imagem com detalhes visuais (iluminação, composição,
 * ângulo, cores) SEM mudar o assunto principal. Se o LLM falhar ou o prompt já
 * for longo, devolve o prompt original (fallback seguro).
 */
export async function enhancePromptForImage(prompt: string): Promise<string> {
  if (prompt.length >= 100) return prompt;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return prompt;

  const systemMessage = [
    'Você é um especialista em publicidade digital especializado em descrições de imagens.',
    'Preserve o tema principal do prompt original. Adicione detalhes visuais (iluminação, composição, ângulo, cores) SEM mudar o assunto principal.',
    'A imagem deve parecer um anúncio profissional de pequena/média empresa, adequado para Instagram e Facebook.',
    'IMPORTANTE: a imagem NÃO deve conter nenhum texto, letras, legendas, hashtags, logotipos ou nomes escritos (ex.: nada de "FURY", "#...", frases na imagem) — apenas a cena visual.',
    'O prompt melhorado deve ter entre 150 e 400 caracteres e estar em português.',
    'Retorne APENAS o prompt melhorado, sem aspas, sem introdução.',
  ].join('\n');

  const userMessage = `Prompt original: "${prompt}"`;

  try {
    const response = await openrouterService.chat(
      [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ],
      { model: 'deepseek/deepseek-chat', max_tokens: 600, temperature: 0.7 },
    );

    const improved = response?.trim();
    return improved && improved.length > 0 ? improved : prompt;
  } catch {
    return prompt;
  }
}