import fetch from 'node-fetch';

type Message = { role: string; content: string };

export const claude = {
  messages: {
    create: async (opts: { model: string; max_tokens: number; system: string; messages: Message[] }) => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');

      const prompt = `${opts.system}\n\n${opts.messages.map(m => m.content).join('\n\n')}`;

      const body = {
          model: 'claude-sonnet-4-20250514',
        prompt,
        max_tokens_to_sample: opts.max_tokens,
      } as any;

      const res = await fetch('https://api.anthropic.com/v1/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'x-api-key': apiKey,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      const text = data?.completion || data?.output_text || data?.output?.[0]?.content || '';

      return {
        content: [
          {
            type: 'text',
            text,
          },
        ],
        raw: data,
      };
    },
  },
};

export default claude;
