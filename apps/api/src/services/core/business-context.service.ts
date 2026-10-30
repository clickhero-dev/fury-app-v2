import { AppError } from '../../middleware/errorHandler.js';
import { externalFetch } from '../../lib/http-client.js';

type StreamChunk = string | { done: true };
export type BusinessContextStream = (text: string, signal?: AbortSignal) => AsyncIterable<StreamChunk> | Promise<AsyncIterable<StreamChunk>>;

const MAX_CONTEXT_LENGTH = 5000;

async function* openRouterStream(text: string, signal?: AbortSignal): AsyncGenerator<StreamChunk> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new AppError(500, 'OPENROUTER_API_KEY_MISSING', 'Serviço de IA indisponível.');
  const response = await externalFetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.BUSINESS_CONTEXT_MODEL ?? 'deepseek/deepseek-chat',
      stream: true,
      temperature: 0.4,
      max_tokens: 1200,
      messages: [
        { role: 'system', content: 'Melhore a clareza do texto sem inventar fatos. Responda somente com a versão melhorada em português.' },
        { role: 'user', content: text },
      ],
    }),
  });
  if (!response.ok || !response.body) throw new AppError(502, 'BUSINESS_CONTEXT_PROVIDER_ERROR', 'Não foi possível melhorar o texto agora.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') { yield { done: true }; return; }
        try {
          const content = (JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> }).choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch { /* ignora linha SSE incompleta/malformada */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export class BusinessContextService {
  constructor(private readonly deps: { stream: BusinessContextStream } = { stream: openRouterStream }) {}

  async improve(text: string, signal?: AbortSignal): Promise<{ suggestion: string }> {
    const normalized = text.trim();
    if (!normalized || normalized.length > MAX_CONTEXT_LENGTH) {
      throw new AppError(400, 'BUSINESS_CONTEXT_INVALID', 'Informe um contexto válido.');
    }
    let suggestion = '';
    let terminal = false;
    for await (const chunk of await this.deps.stream(normalized, signal)) {
      if (typeof chunk === 'string') suggestion += chunk;
      else if (chunk.done) terminal = true;
    }
    if (!terminal || !suggestion.trim()) {
      throw new AppError(502, 'BUSINESS_CONTEXT_STREAM_INCOMPLETE', 'A sugestão não foi concluída. Tente novamente.');
    }
    return { suggestion: suggestion.trim() };
  }

  stream(text: string, signal?: AbortSignal): AsyncIterable<StreamChunk> {
    const normalized = text.trim();
    if (!normalized || normalized.length > MAX_CONTEXT_LENGTH) {
      throw new AppError(400, 'BUSINESS_CONTEXT_INVALID', 'Informe um contexto válido.');
    }
    return this.deps.stream(normalized, signal) as AsyncIterable<StreamChunk>;
  }
}
