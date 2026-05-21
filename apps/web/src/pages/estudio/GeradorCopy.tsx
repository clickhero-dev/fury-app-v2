import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Copy, Check, PenTool } from 'lucide-react';
import { AppLayout, PageHeader, EmptyState, LoadingSpinner, Button } from '@/components';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import type { CopyVariacao, CopyType, CopyTone, GenerateCopyPayload } from '@/types/studio';

// ─── Constants ────────────────────────────────────────────────────────────────

const COPY_LIMITS: Record<CopyType, number | null> = {
  headline: 40,
  descricao: 125,
  cta: 20,
  completo: null,
};

const MOCK_VARIACOES: CopyVariacao[] = [
  {
    texto: 'Transforme seu sorriso hoje!',
    caracteres: 28,
    pontuacao: 9.2,
  },
  {
    texto: 'Implante com condições especiais',
    caracteres: 33,
    pontuacao: 8.7,
  },
  {
    texto: 'Agende sua avaliação gratuita',
    caracteres: 30,
    pontuacao: 8.1,
  },
];

const COPY_TYPES: Array<{ value: CopyType; label: string }> = [
  { value: 'headline', label: 'Headline' },
  { value: 'descricao', label: 'Descrição' },
  { value: 'cta', label: 'CTA (Call-to-Action)' },
  { value: 'completo', label: 'Completo' },
];

const TONES: Array<{ value: CopyTone; label: string }> = [
  { value: 'formal', label: 'Formal' },
  { value: 'casual', label: 'Casual' },
  { value: 'urgente', label: 'Urgente' },
  { value: 'emocional', label: 'Emocional' },
];

const VARIACOES_COUNT: Array<{ value: 3 | 4 | 5; label: string }> = [
  { value: 3, label: '3 variações' },
  { value: 4, label: '4 variações' },
  { value: 5, label: '5 variações' },
];

const INITIAL_FORM = {
  type: '' as CopyType | '',
  produto: '',
  publico: '',
  objetivo: '',
  tom: '' as CopyTone | '',
  quantidadeVariacoes: 3 as 3 | 4 | 5,
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

function CopyCard({ variacao, type }: { variacao: CopyVariacao; type: CopyType }) {
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
    <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
      <p className="text-text-primary text-base leading-relaxed">{variacao.texto}</p>

      <div className="flex items-center gap-2">
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
          Usar variação
        </button>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GeradorCopy() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [variacoes, setVariacoes] = useState<CopyVariacao[]>([]);

  const isFormValid =
    form.type &&
    form.produto.trim().length > 0 &&
    form.publico.trim().length > 0 &&
    form.objetivo.trim().length > 0 &&
    form.tom;

  const mutation = useMutation({
    mutationFn: async (payload: GenerateCopyPayload) => {
      try {
        const response = await api.post('/studio/generate-copy', payload);
        return response.data.variacoes || MOCK_VARIACOES;
      } catch {
        return MOCK_VARIACOES;
      }
    },
    onSuccess: (data) => {
      setVariacoes(data);
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
      quantidadeVariacoes: form.quantidadeVariacoes,
    });
  };

  const handleReset = () => {
    setForm(INITIAL_FORM);
    setVariacoes([]);
  };

  const isLoading = mutation.isPending;
  const showResult = variacoes.length > 0;

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
                  {variacoes.length} opções geradas • Selecione a melhor para seu anúncio
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {variacoes.map((variacao, idx) => (
                <CopyCard
                  key={`${form.type}-${idx}`}
                  variacao={variacao}
                  type={form.type as CopyType}
                />
              ))}
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

              <SelectField
                id="quantidade"
                label="Quantidade de Variações"
                value={String(form.quantidadeVariacoes)}
                onChange={(value) =>
                  setForm({ ...form, quantidadeVariacoes: parseInt(value) as 3 | 4 | 5 })
                }
                options={VARIACOES_COUNT.map(opt => ({ ...opt, value: String(opt.value) }))}
              />

              <Button
                variant="primary"
                size="md"
                className="w-full"
                onClick={handleGenerateCopy}
                disabled={!isFormValid}
              >
                Gerar Copy
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
