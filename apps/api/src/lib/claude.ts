import Anthropic from '@anthropic-ai/sdk';

type Message = {
  role: string;
  content: string | Array<unknown>;
};

export const claude = {
  messages: {
    create: async (opts: { model: string; max_tokens: number; system: string; messages: Message[] }) => {
      const apiKey = process.env.ANTHROPIC_API_KEY;

      if (!apiKey) {
        console.warn('[CLAUDE WARN] Missing ANTHROPIC_API_KEY - returning empty fallback');
        return {
          content: [{ type: 'text', text: '{ "variacoes": [] }' }],
          raw: { status: 'FALLBACK_NO_API_KEY' },
        };
      }

      try {
        const client = new Anthropic({ apiKey });
        const data = await client.messages.create({
          model: opts.model,
          max_tokens: opts.max_tokens,
          system: opts.system,
          messages: opts.messages as any,
        });

        return {
          content: data.content,
          raw: data,
        };
      } catch (err) {
        console.error('[CLAUDE ERROR]:', err);
        throw err;
      }
    },
  },
};

export default claude;