type Message = { role: 'system' | 'user' | 'assistant'; content: string };

interface ChatOptions {
  temperature?: number;
  max_tokens?: number;
  // DeepSeek é OpenAI-compatible: força a resposta a ser um objeto JSON válido.
  response_format?: { type: 'json_object' };
}

async function chat(messages: Message[], options: ChatOptions = {}): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY não configurada');

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 1500,
      ...(options.response_format ? { response_format: options.response_format } : {}),
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DeepSeek API error ${response.status}: ${err}`);
  }

  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content ?? '';
}

export const deepseekService = { chat };
