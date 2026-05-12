type Message = { role: string; content: string };

export const claude = {
  messages: {
    create: async (opts: { model: string; max_tokens: number; system: string; messages: Message[] }) => {
      const apiKey = process.env.ANTHROPIC_API_KEY;

      if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');

      const prompt = `${opts.system}\n\n${opts.messages.map(m => m.content).join('\n\n')}`;

      try {
        const res = await fetch('https://api.anthropic.com/v1/complete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: opts.model || 'claude-2.1',
            prompt: `\n\nHuman: ${prompt}\n\nAssistant:`,
            max_tokens_to_sample: opts.max_tokens,
          }),
        });

        const data = (await res.json()) as any;
        return {
          content: [{ type: 'text', text: (data.completion || '').trim() }],
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