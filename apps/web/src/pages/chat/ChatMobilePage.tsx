import { FormEvent, useMemo, useState } from 'react';
import { Check, ChevronRight, MessageCircle, Plus, Send, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type CapabilityId = 'video' | 'image' | 'campaign-data' | 'publish' | 'schedule' | 'campaign';

type Capability = {
  id: CapabilityId;
  label: string;
  example: string;
  summary: string;
  to: string;
};

const capabilities: Capability[] = [
  { id: 'video', label: 'Criar vídeo', example: 'Crie um vídeo para promoção', summary: 'Abrir a criação de vídeo no Estúdio.', to: '/estudio/criativo' },
  { id: 'image', label: 'Criar imagem', example: 'Crie uma imagem para uma promoção', summary: 'Abrir a criação rápida de imagem no Estúdio.', to: '/estudio?criar=rapida' },
  { id: 'campaign-data', label: 'Ver dados da campanha', example: 'Mostre os dados das minhas campanhas', summary: 'Abrir o painel de campanhas e seus dados disponíveis.', to: '/campanhas' },
  { id: 'publish', label: 'Publicar postagem', example: 'Publique uma postagem agora', summary: 'Abrir a postagem para revisão e publicação.', to: '/calendario?criar=post' },
  { id: 'schedule', label: 'Agendar postagem', example: 'Agende uma postagem para amanhã', summary: 'Abrir a postagem para escolher data e horário.', to: '/calendario?criar=post' },
  { id: 'campaign', label: 'Criar campanha', example: 'Crie uma campanha de vendas', summary: 'Abrir o assistente de criação de campanha.', to: '/criar-campanha' },
];

function recognizeCapability(value: string): Capability | null {
  const text = value.toLocaleLowerCase('pt-BR');
  if (/(agend|program).*(post|publica)|(post|publica).*(agend|program)/.test(text)) return capabilities[4];
  if (/(publi|post).*(agora|já|hoje)|publicar/.test(text)) return capabilities[3];
  if (/(dados|métricas|metricas|resultado|desempenho).*(campanha)|campanha.*(dados|métricas|metricas|resultado|desempenho)/.test(text)) return capabilities[2];
  if (/(criar|gere|gerar).*(campanha)|nova campanha/.test(text)) return capabilities[5];
  if (/(vídeo|video)/.test(text)) return capabilities[0];
  if (/(imagem|arte|criativo)/.test(text)) return capabilities[1];
  return null;
}

export function ChatMobilePage() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [pending, setPending] = useState<Capability | null>(null);
  const [messages, setMessages] = useState<string[]>([
    'Olá! Eu sou o Ady. Posso ajudar com campanhas, conteúdos e criações.',
  ]);

  const canSend = input.trim().length > 0;
  const catalog = useMemo(() => capabilities, []);

  function requestCapability(capability: Capability) {
    setCatalogOpen(false);
    setMessages((current) => [...current, `Você: ${capability.example}`, `Ady: Revisar: ${capability.label}. ${capability.summary}`]);
    setPending(capability);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSend) return;
    const message = input.trim();
    const capability = recognizeCapability(message);
    setInput('');
    setMessages((current) => {
      const next = [...current, `Você: ${message}`];
      return capability
        ? [...next, `Ady: Revisar: ${capability.label}. ${capability.summary}`]
        : [...next, 'Ady: Posso criar imagem ou vídeo, ver dados da campanha, publicar ou agendar postagens e criar campanhas. O que você gostaria de fazer?'];
    });
    setPending(capability);
  }

  function cancel() {
    setPending(null);
    setMessages((current) => [...current, 'Ady: Ação cancelada. Nenhuma alteração foi feita.']);
  }

  function confirm() {
    if (!pending) return;
    navigate(pending.to);
  }

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-background px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 text-text-primary sm:px-6">
      <section className="mx-auto flex min-h-[calc(100vh-1.5rem)] w-full max-w-2xl flex-col rounded-2xl border border-border bg-surface shadow-sm">
        <header className="flex items-center gap-3 border-b border-border px-4 py-4">
          <span className="flex size-10 items-center justify-center rounded-full bg-brand text-white"><MessageCircle aria-hidden="true" className="size-5" /></span>
          <div><h1 className="font-semibold">Ady | Conversa</h1><p className="text-sm text-text-tertiary">Peça uma ação ou escolha uma capacidade.</p></div>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-5" aria-live="polite">
          {messages.map((message, index) => (
            <p key={`${message}-${index}`} className={`w-fit max-w-[90%] rounded-2xl px-3 py-2 text-sm ${message.startsWith('Você:') ? 'ml-auto bg-brand text-white' : 'bg-surface-hover text-text-primary'}`}>{message}</p>
          ))}
          {pending && (
            <div className="rounded-xl border border-brand/30 bg-brand/5 p-3" aria-label="Revisão da ação">
              <p className="font-medium">Revisar: {pending.label}</p><p className="mt-1 text-sm text-text-secondary">{pending.summary} A ação só será iniciada no próximo passo.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={cancel} className="rounded-lg border border-border px-3 py-2 text-sm font-medium"><X className="mr-1 inline size-4" aria-hidden="true" />Cancelar</button>
                <button type="button" onClick={confirm} className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white"><Check className="mr-1 inline size-4" aria-hidden="true" />Confirmar</button>
              </div>
            </div>
          )}
        </div>

        {catalogOpen && (
          <aside aria-label="Capacidades disponíveis" className="mx-3 mb-3 rounded-xl border border-border bg-surface-hover p-3">
            <div className="mb-2 flex items-center justify-between"><h2 className="font-medium">O que posso fazer</h2><button type="button" aria-label="Fechar capacidades" onClick={() => setCatalogOpen(false)}><X className="size-5" /></button></div>
            <div className="grid gap-2 sm:grid-cols-2">{catalog.map((capability) => <button key={capability.id} type="button" onClick={() => requestCapability(capability)} className="flex min-w-0 items-center justify-between rounded-lg border border-border bg-surface p-3 text-left hover:border-brand"><span><span className="block text-sm font-medium">{capability.label}</span><span className="block text-xs text-text-tertiary">Exemplo: “{capability.example}”</span></span><ChevronRight className="size-4 shrink-0" aria-hidden="true" /></button>)}</div>
          </aside>
        )}
        <form onSubmit={submit} className="flex items-end gap-2 border-t border-border p-3">
          <button type="button" aria-label="Abrir capacidades" onClick={() => setCatalogOpen((open) => !open)} className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border"><Plus aria-hidden="true" className="size-5" /></button>
          <label className="sr-only" htmlFor="ady-message">Mensagem para Ady</label>
          <textarea id="ady-message" aria-label="Mensagem para Ady" value={input} onChange={(event) => setInput(event.target.value)} rows={1} placeholder="Digite sua mensagem…" className="min-h-11 flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm" />
          <button type="submit" aria-label="Enviar mensagem" disabled={!canSend} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-white disabled:opacity-40"><Send aria-hidden="true" className="size-4" /></button>
        </form>
      </section>
    </main>
  );
}
