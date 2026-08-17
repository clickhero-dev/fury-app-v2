import { useState } from 'react';
import { roadmap, summaryCards, type Milestone } from './roadmapData';
import { AppLayout } from '@/components';
import { Check, Sparkles, Map, Building2, MessageCircle, ScanSearch } from 'lucide-react';

/* ---------------------------------------------------------------
 * Roadmap do Ady
 *
 * Página autônoma com identidade visual própria (estilo Ady — tema
 * escuro, paleta Petróleo #1E88A8 e Faísca #CF6F03). Não depende do
 * tema atual do app para exibir a marca corretamente.
 * --------------------------------------------------------------- */

/** Ícones por capítulo futuro/passado (só ilustrativo por fase). */
const phaseIcons: Record<number, typeof Map> = {
  0: Map,
  1: Sparkles,
  2: Building2,
  3: Sparkles,
  4: Sparkles,
  5: Map,
  6: MessageCircle,
  7: ScanSearch,
};

const statusStyles: Record<Milestone['status'], { dot: string; badge: string; label: string; ring: string; title: string }> = {
  done: {
    dot: 'bg-[#1E88A8]',
    badge: 'bg-[#1E88A8]/15 text-[#6fc3dd] border border-[#1E88A8]/40',
    label: 'Concluído',
    ring: 'bg-[#1E88A8] text-white',
    title: 'text-[#ECEDEF]',
  },
  active: {
    dot: 'bg-[#CF6F03] animate-pulse',
    badge: 'bg-[#CF6F03]/15 text-[#f0a44a] border border-[#CF6F03]/40',
    label: 'Em andamento',
    ring: 'bg-[#CF6F03] text-white',
    title: 'text-[#f0a44a]',
  },
  planned: {
    dot: 'bg-[#3a3f3c]',
    badge: 'bg-[#1F211D] text-[#8E939D] border border-dashed border-[#33383a]',
    label: 'Planejado',
    ring: 'bg-[#1F211D] text-[#8E939D] border border-dashed border-[#33383a]',
    title: 'text-[#8E939D]',
  },
};

function MilestoneRow({ ms, index }: { ms: Milestone; index: number }) {
  const [open, setOpen] = useState(ms.current ?? ms.status === 'active');
  const Icon = phaseIcons[index] ?? Sparkles;
  const s = statusStyles[ms.status];

  return (
    <li className="relative pl-14 pb-8 last:pb-0">
      {/* Trilho vertical */}
      <span
        aria-hidden
        className="absolute left-[22px] top-12 bottom-0 w-px bg-gradient-to-b from-[#1E88A8]/40 via-[#242824] to-[#1F211D]"
      />

      {/* Nó (ponto na trilha) */}
      <span
        className={`absolute left-4 top-8 flex h-6 w-6 items-center justify-center rounded-full ring-8 ring-[#0C0D0A] ${s.ring}`}
      >
        {ms.status === 'done' ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />}
      </span>

      <div
        className={`rounded-2xl border bg-[#141512] shadow-lg transition-colors ${
          ms.status === 'planned' ? 'border-dashed border-[#2a2e2b] opacity-80' : 'border-[#1F211D]'
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-4 px-5 py-4 sm:px-6 sm:py-4.5 text-left rounded-2xl hover:bg-[#181a17] transition-colors"
        >
          <div className="flex min-w-0 items-center gap-3.5 sm:gap-4">
            <div className={`hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${s.badge.split(' ')[0]}`}>
              <Icon className="h-[18px] w-[18px] text-[#1E88A8]" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={`text-[11px] font-bold tracking-widest uppercase ${s.title}`}>{ms.period}</span>
                {ms.current && ms.status === 'active' && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest bg-[#CF6F03] text-white px-2 py-0.5 rounded-full">
                    <Sparkles className="h-3 w-3" /> Nós estamos aqui
                  </span>
                )}
              </div>
              <h3 className={`mt-1 truncate text-base sm:text-lg font-bold leading-snug ${s.title}`}>{ms.title}</h3>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${s.badge}`}>{s.label}</span>
            <span className="text-text-tertiary text-lg leading-none">{open ? '−' : '+'}</span>
          </div>
        </button>

        {open && (
          <div className="border-t border-[#1F211D] px-5 pt-5 pb-6 sm:px-6 sm:pb-7">
            <div className="mx-auto max-w-xl space-y-5">
              <p className="text-sm leading-relaxed text-[#A3A8B3]">{ms.summary}</p>
              <div className="space-y-2.5">
                {ms.gains.map((g) => (
                  <div key={g} className="flex items-start gap-2.5 text-sm leading-snug text-[#ECEDEF]">
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${ms.status === 'planned' ? 'bg-[#1F211D]' : 'bg-[#1E88A8]/20'}`}>
                      <Check className="h-3 w-3 text-[#1E88A8]" strokeWidth={3} />
                    </span>
                    {g}
                  </div>
                ))}
              </div>
              {ms.quote && (
                <blockquote className="border-l-2 border-[#1E88A8] pl-4">
                  <p className="text-sm italic text-[#6fc3dd]">“{ms.quote}”</p>
                </blockquote>
              )}
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

export function RoadmapPage() {
  return (
    <div className="min-h-screen text-[#ECEDEF]">
      {/* Faixa de destaque (header hero) */}
      <section className="border-b border-[#1F211D] bg-gradient-to-b from-[#0e1116] to-[#0C0D0A]">
        <div className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#1E88A8]/40 bg-[#1E88A8]/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-[#6fc3dd]">
            <Map className="h-3.5 w-3.5" /> Roadmap do Ady
          </div>
          <h1 className="mt-5 text-3xl sm:text-5xl font-black tracking-tight">
            A nossa história &amp; <span className="text-[#1E88A8]">o que vem por aí</span>
          </h1>
          <p className="mt-4 max-w-2xl text-base sm:text-lg leading-relaxed text-[#A3A8B3]">
            Do primeiro passo até um futuro em que o Ady conversa com você, criamos esta linha do tempo
            para mostrar tudo que já conquistamos — e para onde estamos indo.
          </p>
        </div>
      </section>

      {/* Resumo em cartões */}
      <section className="mx-auto max-w-5xl px-6 pt-10 sm:pt-12">
        <div className="grid gap-4 sm:gap-5 sm:grid-cols-3">
          {summaryCards.map((c) => (
            <div key={c.label} className="rounded-2xl border border-[#1F211D] bg-[#141512] p-5 sm:p-6 shadow-lg">
              <div
                className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest ${
                  c.status === 'done'
                    ? 'bg-[#1E88A8]/15 text-[#6fc3dd]'
                    : c.status === 'active'
                    ? 'bg-[#CF6F03]/15 text-[#f0a44a]'
                    : 'bg-[#1F211D] text-[#8E939D]'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    c.status === 'done' ? 'bg-[#1E88A8]' : c.status === 'active' ? 'bg-[#CF6F03] animate-pulse' : 'bg-[#4a504c]'
                  }`}
                />
                {c.label}
              </div>
              <div className="mt-5 flex items-center gap-3">
                <span className="text-3xl font-black text-[#ECEDEF] leading-none">{c.value}</span>
                <span className="text-sm leading-snug text-[#8E939D]">{c.description}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Timeline */}
      <section className="mx-auto max-w-3xl px-6 pt-12 sm:pt-14 pb-16">
        <ol className="relative">
          {roadmap.map((ms, i) => (
            <MilestoneRow key={ms.period + ms.title} ms={ms} index={i} />
          ))}
        </ol>
      </section>

      {/* Fechamento */}
      <section className="border-t border-[#1F211D] bg-[#0e1116]">
        <div className="mx-auto max-w-3xl px-6 py-10 text-center">
          <p className="mx-auto max-w-2xl text-base sm:text-lg font-semibold text-[#E4E8F0] leading-relaxed">
            “O Ady começou criando conteúdo, passou a publicar sozinho, e agora vai te colocar no Google,
            conversar com você pelo WhatsApp e aprender sobre o seu negócio.”
          </p>
          <p className="mt-2.5 text-sm text-[#8E939D]">Até se tornar um parceiro que trabalha junto com você.</p>
        </div>
      </section>
    </div>
  );
}

/**
 * Opção de página dentro do shell autenticado (usa AppLayout padrão).
 * Mantida disponível caso prefira exibir dentro da navegação do app.
 */
export function RoadmapPageShell() {
  return (
    <AppLayout>
      <RoadmapPage />
    </AppLayout>
  );
}
