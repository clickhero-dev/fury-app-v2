import { useEffect, useRef, useState } from 'react';
import { Lightbulb, Loader2, X } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL ?? '';

export function BusinessContextImprover({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [suggestion, setSuggestion] = useState('');
  const [generating, setGenerating] = useState(false);
  const [feedback, setFeedback] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const [sourceText, setSourceText] = useState('');

  const suggestionStale = Boolean(suggestion && value !== sourceText);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function improve() {
    if (!value.trim() || generating) return;
    setSourceText(value);
    setGenerating(true); setSuggestion(''); setFeedback('');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch(`${API_URL}/auth/business-context/improve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
        body: JSON.stringify({ text: value }), signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error('request_failed');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = ''; let completed = false;
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const events = buffer.split('\n\n'); buffer = events.pop() ?? '';
        for (const event of events) {
          const type = event.match(/^event: (.+)$/m)?.[1];
          const data = event.match(/^data: (.+)$/m)?.[1];
          if (type === 'fragment' && data) setSuggestion((current) => current + JSON.parse(data).text);
          if (type === 'done') completed = true;
          if (type === 'error') throw new Error('stream_failed');
        }
      }
      if (!completed) throw new Error('stream_incomplete');
      setFeedback('Sugestão pronta. Revise antes de usar.');
    } catch (error) {
      if ((error as Error).name !== 'AbortError') { setSuggestion(''); setFeedback('Não foi possível melhorar o texto agora.'); }
    } finally { setGenerating(false); abortRef.current = null; }
  }

  function cancel() { abortRef.current?.abort(); setSuggestion(''); setFeedback('Melhoria cancelada. O texto original foi preservado.'); setGenerating(false); }

  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2 items-center">
      <button type="button" onClick={improve} disabled={!value.trim() || generating} aria-label="Melhorar contexto do negócio" className="inline-flex items-center gap-2 rounded-md border border-admin-petrol px-3 py-2 text-sm font-semibold text-admin-petrol disabled:opacity-50">
        {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />} {generating ? 'Melhorando…' : 'Melhorar contexto'}
      </button>
      {generating && <button type="button" onClick={cancel} className="inline-flex items-center gap-1 text-sm text-muted-foreground"><X className="h-4 w-4" /> Cancelar</button>}
    </div>
    {suggestion && <div className="rounded-md border border-admin-petrol/30 bg-admin-petrol/5 p-3" aria-live="polite">
      <p className="mb-2 text-xs font-semibold text-muted-foreground">Sugestão (chegando…)</p>
      <p className="whitespace-pre-wrap text-sm">{suggestion}</p>
      {!generating && <div className="mt-3 flex gap-2"><button type="button" disabled={suggestionStale} onClick={() => { if (!suggestionStale) onChange(suggestion); }} className="rounded-md bg-admin-petrol px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50" aria-label="Usar sugestão">Usar sugestão</button><button type="button" onClick={() => setSuggestion('')} className="rounded-md border px-3 py-2 text-sm">Descartar</button></div>}
      {suggestionStale && <p className="mt-2 text-xs text-amber-700" role="alert">O texto original mudou; gere uma nova sugestão antes de usar.</p>}
    </div>}
    {feedback && <p role="status" className="text-sm text-muted-foreground">{feedback}</p>}
  </div>;
}
