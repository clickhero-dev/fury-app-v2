import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Copy, Check, PenTool } from 'lucide-react';
import { AppLayout, PageHeader, EmptyState, LoadingSpinner, Button } from '@/components';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import type { CopyVariacao, CopyType, CopyTone, GenerateCopyPayload } from '@/types/studio';

type CopyVariationCard = CopyVariacao & {
  id?: string;
  compliance_status?: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const COPY_LIMITS: Record<CopyType, number | null> = {
  headline: 40,
  descricao: 125,
  cta: 20,
  completo: null,
};

const COPY_TYPES: Array<{ value: CopyType; label: string }> = [
  { value: 'headline', label: 'Headline' },
  { value: 'descricao', label: 'Descrição' },
  { value: 'cta', label: 'CTA (Call-to-Action)' },
  { value: 'completo', label: 'Completo' },
];

const TONES: Array<{ value: CopyTone; label: string }> = [
  { value: 'formal', label: 'Profissional' },
  { value: 'urgente', label: 'Urgente' },
  { value: 'casual', label: 'Casual' },
  { value: 'emocional', label: 'Inspirador' },
];

const INITIAL_FORM = {
  type: '' as CopyType | '',
  produto: '',
  publico: '',
  objetivo: '',
  tom: '' as CopyTone | '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCharacterStatus(texto: string, type: CopyType): 'ok' | 'warning' {
  const limit = COPY_LIMITS[type];
  if (limit === null) return 'ok';
  return texto.length <= limit ? 'ok' : 'warning';
}

function isCharacterCountValid(texto: string, type: CopyType): boolean {
  const limit = COPY_LIMITS[type];
  return limit === null || texto.length <= limit;
}

function mapBackendVariations(data: any[], type: CopyType): CopyVariationCard[] {
  const ctaWords = ['compre', 'acesse', 'saiba', 'clique', 'garanta'];
  const forbidden = ['grátis excessivo', 'garantido 100%', 'melhor do mundo'];

  return data.map((v: any) => {
    const headline = String(v.headline || '');
    const primary = String(v.primary_text || v.primaryText || '');
    const cta = String(v.cta || '') || '';
    const texto = type === 'headline' ? headline : type === 'descricao' ? primary : type === 'cta' ? cta : `${headline} ${primary} ${cta}`.trim();
    const caracteres = texto.length;

    let pontuacao = 3;
    const limitMap: Record<CopyType, number | null> = { headline: 40, descricao: 125, cta: 20, completo: null };
    const limit = limitMap[type] ?? 300;
    if (caracteres <= (limit ?? 9999)) pontuacao += 3;
    if (ctaWords.some(w => texto.toLowerCase().includes(w))) pontuacao += 2;
    if (!forbidden.some(w => texto.toLowerCase().includes(w))) pontuacao += 2;

    return {
      texto,
      caracteres,
      pontuacao,
      id: v.id,
      compliance_status: v.compliance_status ?? v.complianceStatus ?? 'pending',
    } as any;
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InputField({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <label htmlFor={id} className="block text-sm font-semibold text-text-primary">
        {label}
      </label>
      <Input
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  id,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  id: string;
}) {
  return (
    <div className="space-y-3">
      <label htmlFor={id} className="block text-sm font-semibold text-text-primary">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3.5 border border-[#E0E0E0] rounded-xl bg-white text-text-primary placeholder-[#6E7681] transition-all duration-200 focus:outline-none focus:border-[#E8631A] focus:ring-1 focus:ring-[#E8631A]/20 disabled:opacity-50 disabled:bg-[#F6F8FA] text-base"
      >
        <option value="">Selecione uma opção</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function CopyCard({
  variacao,
  type,
  selected,
  onSelect,
}: {
  variacao: CopyVariationCard;
  type: CopyType;
  selected: boolean;
  onSelect: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const limit = COPY_LIMITS[type];
  const status = getCharacterStatus(variacao.texto, type);
  const isValid = isCharacterCountValid(variacao.texto, type);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(variacao.texto);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error('Failed to copy');
    }
  };

  const handleUsarVariacao = () => {
    try {
      localStorage.setItem('fury_selected_copy', variacao.texto);
    } catch {
      console.error('Failed to save to localStorage');
    }
  };

  return (
    <div className={cn(
      'bg-surface border rounded-xl p-5 space-y-4 transition-all',
      selected ? 'border-[#E8631A] ring-2 ring-[#E8631A]/15 shadow-sm' : 'border-border'
    )}>
      <div className="rounded-2xl border border-[#E9ECEF] bg-gradient-to-br from-white via-[#FFF8F2] to-[#F8FAFC] p-4 space-y-3">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-text-secondary">
          <span>Sponsored</span>
          <span>Meta Ads Preview</span>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-text-primary leading-tight">{variacao.texto.split(' ')[0] ? variacao.texto : 'Preview da copy gerada'}</p>
          <p className="text-sm text-text-secondary leading-relaxed">
            {variacao.texto}
          </p>
        </div>
        <button className="inline-flex items-center justify-center rounded-full bg-[#E8631A] px-4 py-2 text-xs font-semibold text-white">
          Saiba mais
        </button>
      </div>

      <div className="flex items-center gap-2">
        {variacao.compliance_status && (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-[#F3F4F6] text-text-secondary">
            {variacao.compliance_status === 'approved' ? '✅ Compliance OK' : variacao.compliance_status === 'rejected' ? '⛔ Rejeitado' : '⚠️ Pendente'}
          </span>
        )}
        <span
          className={cn(
            'inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg',
            status === 'ok'
              ? 'bg-success-light text-success'
              : 'bg-error-light text-error'
          )}
        >
          {variacao.caracteres} {limit ? `/ ${limit}` : ''} caracteres
        </span>
        {variacao.pontuacao && (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-[#FEF0E7] text-accent">
            ⭐ {variacao.pontuacao}
          </span>
        )}
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={handleCopy}
          aria-label={copied ? 'Copiado para área de transferência' : 'Copiar para área de transferência'}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all',
            copied
              ? 'bg-success text-white'
              : 'border border-[#E8631A] text-[#E8631A] hover:bg-[#FEF0E7]'
          )}
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              Copiado!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              Copiar
            </>
          )}
        </button>
        <button
          onClick={handleUsarVariacao}
          disabled={!isValid}
          aria-label={isValid ? 'Usar esta variação' : 'Número de caracteres excede o limite'}
          className="flex-1 px-3 py-2.5 bg-[#E8631A] text-white rounded-lg text-xs font-semibold hover:bg-[#D45714] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Usar esta
        </button>
      </div>

      <button
        onClick={onSelect}
        className={cn(
          'w-full px-3 py-2.5 border rounded-lg text-xs font-semibold transition-colors',
          selected
            ? 'bg-[#FEF0E7] border-[#E8631A] text-[#B54708]'
            : 'border-[#E0E0E0] bg-white text-text-primary hover:bg-[#F6F8FA]'
        )}
      >
        {selected ? 'Selecionada' : 'Usar esta'}
      </button>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GeradorCopy() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [variacoes, setVariacoes] = useState<CopyVariationCard[]>([]);
  const [selectedVariationId, setSelectedVariationId] = useState<string | null>(null);

  const isFormValid =
    form.type &&
    form.produto.trim().length > 0 &&
    form.publico.trim().length > 0 &&
    form.objetivo.trim().length > 0 &&
    form.tom;

  const mutation = useMutation({
    mutationFn: async (payload: GenerateCopyPayload) => {
      const response = await api.post('/studio/copy/generate', payload);
      return response.data.variations || [];
    },
    onSuccess: (data) => {
      const mapped = mapBackendVariations(data, form.type as CopyType);
      setVariacoes(mapped);
      setSelectedVariationId(mapped[0]?.id ?? null);
    },
  });

  const handleGenerateCopy = () => {
    if (!isFormValid) return;

    mutation.mutate({
      type: form.type as CopyType,
      produto: form.produto,
      publico: form.publico,
      objetivo: form.objetivo,
      tom: form.tom as CopyTone,
      quantidadeVariacoes: 3,
    });
  };

  const handleReset = () => {
    setForm(INITIAL_FORM);
    setVariacoes([]);
  };

  const isLoading = mutation.isPending;
  const showResult = variacoes.length > 0;
  const selectedVariation = variacoes.find((variacao) => variacao.id === selectedVariationId) ?? variacoes[0] ?? null;

  return (
    <AppLayout>
      <div className="space-y-8">
        <PageHeader
          title="Gerador de Copy"
          description="Crie textos persuasivos para seus anúncios com IA"
          actions={showResult ? <Button variant="outline" size="sm" onClick={handleReset}>Gerar novos</Button> : undefined}
        />

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <LoadingSpinner size="lg" />
            <p className="text-text-secondary">A IA está criando suas variações de copy...</p>
          </div>
        )}

        {showResult && !isLoading && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 px-5 py-3.5 bg-success-light rounded-xl border border-success/20">
              <span className="text-2xl">✨</span>
              <div>
                <p className="font-semibold text-success text-sm">
                  Variações criadas com sucesso!
                </p>
                <p className="text-xs text-success/80 mt-0.5">
                  3 opções geradas • Selecione a melhor para seu anúncio
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {variacoes.map((variacao, idx) => (
                <CopyCard
                  key={`${form.type}-${idx}`}
                  variacao={variacao}
                  type={form.type as CopyType}
                  selected={variacao.id === selectedVariationId}
                  onSelect={() => setSelectedVariationId(variacao.id ?? null)}
                />
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 border border-border rounded-xl bg-white p-4">
              <div>
                <p className="font-semibold text-text-primary">Publicar seleção no Meta</p>
                <p className="text-sm text-text-secondary">
                  {selectedVariation ? 'A variação selecionada será enviada pelo fluxo compartilhado do estúdio.' : 'Selecione uma variação para publicar.'}
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                disabled={!selectedVariation?.id || selectedVariation.compliance_status !== 'approved'}
                onClick={async () => {
                  if (!selectedVariation?.id) return;
                  try {
                    await api.post(`/studio/publish/${selectedVariation.id}`, {});
                  } catch (error) {
                    console.error('Erro ao publicar no Meta', error);
                  }
                }}
              >
                Publicar no Meta
              </Button>
            </div>
          </div>
        )}

        {!isLoading && !showResult && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-surface border border-border rounded-xl p-6 space-y-6">
              <h3 className="font-bold text-text-primary">Briefing</h3>

              <SelectField
                id="type"
                label="Tipo de Copy"
                value={form.type}
                onChange={(value) => setForm({ ...form, type: value as CopyType | '' })}
                options={COPY_TYPES}
              />

              <InputField
                id="produto"
                label="Produto/Serviço"
                placeholder="Ex: Implante dentário"
                value={form.produto}
                onChange={(value) => setForm({ ...form, produto: value })}
              />

              <InputField
                id="publico"
                label="Público-alvo"
                placeholder="Ex: Adultos acima de 30 anos"
                value={form.publico}
                onChange={(value) => setForm({ ...form, publico: value })}
              />

              <InputField
                id="objetivo"
                label="Objetivo do Anúncio"
                placeholder="Ex: Agendar consulta"
                value={form.objetivo}
                onChange={(value) => setForm({ ...form, objetivo: value })}
              />

              <SelectField
                id="tom"
                label="Tom"
                value={form.tom}
                onChange={(value) => setForm({ ...form, tom: value as CopyTone | '' })}
                options={TONES}
              />

              <Button
                variant="primary"
                size="md"
                className="w-full"
                onClick={handleGenerateCopy}
                disabled={!isFormValid}
              >
                Gerar Copies
              </Button>
            </div>

            <div className="flex items-center justify-center">
              <div className="border border-border rounded-xl w-full">
                <EmptyState
                  title="Preencha o briefing para gerar variações de copy"
                  description="Quanto mais detalhes você fornecer, melhor serão as sugestões da IA"
                  icon={<PenTool className="w-6 h-6 text-accent" />}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
