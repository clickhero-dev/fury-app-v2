import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2, ChevronRight, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { AppLayout, PageHeader } from '@/components';
import { useAuth } from '@/hooks/useAuth';
import { completeForm, errorForm } from '@/lib/forms';

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  objective: z.string().min(1, 'Selecione um objetivo'),
  niche: z.string().min(3, 'Mínimo de 3 caracteres'),
  mainProduct: z.string().min(5, 'Mínimo de 5 caracteres'),
  monthlyBudget: z.coerce.number().min(300, 'O orçamento mínimo é R$300/mês'),
  targetCpa: z.coerce.number().positive('Informe um valor válido'),
});

type FormData = z.infer<typeof schema>;

// ─── Constants ────────────────────────────────────────────────────────────────

const OBJECTIVES = [
  { value: 'aumentar_vendas', label: 'Aumentar Vendas' },
  { value: 'gerar_leads', label: 'Atrair Clientes' },
  { value: 'aumentar_trafego', label: 'Aumentar Tráfego' },
  { value: 'reconhecimento_marca', label: 'Reconhecimento de Marca' },
];

const STEP_FIELDS: Record<number, (keyof FormData)[]> = {
  1: ['objective', 'niche', 'mainProduct'],
  2: ['monthlyBudget', 'targetCpa'],
};

const STEP_LABELS = ['Sobre o negócio', 'Orçamento e metas', 'Revisão'];

function getObjectiveLabels(objective: string) {
  if (objective === 'leads' || objective === 'clientes' || objective === 'gerar_leads') {
    return {
      label: 'Quanto você quer pagar por cliente?',
      description: 'Este é o valor máximo que você aceita pagar por um novo cliente',
      conversion: 'cliente',
    };
  }
  if (objective === 'vendas' || objective === 'conversions' || objective === 'aumentar_vendas') {
    return {
      label: 'Quanto você quer pagar por venda?',
      description: 'Este é o valor máximo que você aceita pagar por cada venda',
      conversion: 'venda',
    };
  }
  return {
    label: 'Quanto você quer pagar por resultado?',
    description: 'Este é o valor máximo que você aceita pagar por cada resultado',
    conversion: 'resultado',
  };
}

function translateObjective(value?: string) {
  return OBJECTIVES.find((o) => o.value === value)?.label ?? value ?? '—';
}

function fmtBRL(n?: number) {
  if (!n) return '—';
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MetasPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [formSubmissionId, setFormSubmissionId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    trigger,
    setError,
    getValues,
    watch,
    reset,
    formState: { errors },
  } = useForm<{ objective: string; niche: string; mainProduct: string; monthlyBudget: number; targetCpa: number }>({
    resolver: zodResolver(schema),
    defaultValues: { objective: '', niche: '', mainProduct: '', monthlyBudget: undefined, targetCpa: undefined },
  });

  // ── Prefill from existing goals ───────────────────────────────────────────

  const { data: existingGoals } = useQuery({
    queryKey: ['goals'],
    queryFn: () => api.get('/goals').then((r) => r.data.data).catch(() => null),
    staleTime: 0,
  });

  useEffect(() => {
    if (existingGoals) {
      reset({
        objective: existingGoals.objective ?? '',
        niche: existingGoals.niche ?? '',
        mainProduct: existingGoals.mainProduct ?? '',
        monthlyBudget: existingGoals.monthlyBudget ?? undefined,
        targetCpa: existingGoals.targetCpa ?? undefined,
      });
    }
  }, [existingGoals, reset]);

  // ── Mutation ──────────────────────────────────────────────────────────────

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      existingGoals
        ? api.put('/goals', data).then((r) => r.data)
        : api.post('/goals/setup', data).then((r) => r.data),
    onSuccess: async () => {
      if (formSubmissionId) {
        await completeForm(formSubmissionId).catch(console.error);
      }
      showToast('success', '✅ Metas salvas com sucesso!');
      setTimeout(() => navigate('/dashboard'), 1000);
    },
    onError: async (error: unknown) => {
      if (formSubmissionId) {
        await errorForm(formSubmissionId).catch(console.error);
      }
      const msg =
        (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        'Erro ao salvar metas. Tente novamente.';
      showToast('error', msg);
    },
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleNext() {
    const fields = STEP_FIELDS[step];
    const valid = await trigger(fields);

    if (step === 2 && valid) {
      const { monthlyBudget, targetCpa } = getValues();
      if (targetCpa > monthlyBudget) {
        setError('targetCpa', { message: 'O CPA alvo não pode ser maior que o orçamento mensal' });
        return;
      }
    }

    if (valid) setStep((s) => s + 1);
  }

  function handleBack() {
    setStep((s) => (s > 1 ? s - 1 : s));
  }

  function onSubmit(data: FormData) {
    mutation.mutate(data);
  }

  const values = watch();
  const progressPct = Math.round((step / 3) * 100);
  const isEditing = Boolean(existingGoals);
  const isSaving = mutation.isPending;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      {/* Toast */}
      {toast && (
        <div
          className={cn(
            'fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-lg text-sm font-semibold transition-all duration-300',
            toast.type === 'success'
              ? 'bg-[#2EA043] text-white'
              : 'bg-[#DA3633] text-white'
          )}
        >
          {toast.message}
        </div>
      )}

      <div className="max-w-lg mx-auto space-y-6 pb-8">
        <PageHeader
          title={isEditing ? 'Atualizar Metas' : 'Configurar Metas'}
          description={
            isEditing
              ? 'Revise e atualize seus objetivos de campanha'
              : 'Defina seus objetivos para que a IA possa otimizar suas campanhas'
          }
        />

        <Card>
          <CardContent className="pt-8">
            <div className="space-y-6">
              {/* Progress */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-semibold text-[#6E7681]">
                  <span>Passo {step} de 3 — {STEP_LABELS[step - 1]}</span>
                  <span>{progressPct}%</span>
                </div>
                <div className="w-full bg-[#F0F0F0] rounded-full h-2">
                  <div
                    className="bg-[#E8631A] h-2 rounded-full transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              <hr className="border-[#F0F0F0]" />

              {/* ── Step 1: Sobre o negócio ─────────────────────────────── */}
              {step === 1 && (
                <div className="space-y-5">
                  <Field label="Qual é o objetivo da campanha?" error={errors.objective?.message}>
                    <select
                      {...register('objective')}
                      className={cn(
                        'w-full px-4 py-3.5 border rounded-xl bg-white text-[#1C1C1E] transition-all duration-200 focus:outline-none focus:border-[#E8631A] focus:ring-1 focus:ring-[#E8631A]/20 text-base',
                        errors.objective ? 'border-red-400' : 'border-[#E0E0E0]'
                      )}
                    >
                      <option value="">Selecione um objetivo...</option>
                      {OBJECTIVES.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </Field>

                  <Field
                    label="Qual é o nicho do seu negócio?"
                    hint="Ex: moda feminina, suplementos, cursos online"
                    error={errors.niche?.message}
                  >
                    <Input
                      placeholder="Ex: moda feminina"
                      {...register('niche')}
                      className={errors.niche ? 'border-red-400 focus:border-red-400 focus:ring-red-400/20' : ''}
                    />
                  </Field>

                  <Field
                    label="Qual é o seu produto ou serviço principal?"
                    hint="Seja específico — isso ajuda a IA a gerar melhores insights"
                    error={errors.mainProduct?.message}
                  >
                    <Input
                      placeholder="Ex: vestidos casuais para o dia a dia"
                      {...register('mainProduct')}
                      className={errors.mainProduct ? 'border-red-400 focus:border-red-400 focus:ring-red-400/20' : ''}
                    />
                  </Field>
                </div>
              )}

              {/* ── Step 2: Orçamento e metas ───────────────────────────── */}
              {step === 2 && (
                <div className="space-y-5">
                  <Field
                    label="Orçamento mensal total"
                    hint="Valor total que clientes por mês"
                    error={errors.monthlyBudget?.message}
                  >
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6E7681] font-semibold text-sm">R$</span>
                      <Input
                        type="number"
                        min={300}
                        step={50}
                        placeholder="2.000"
                        {...register('monthlyBudget', { valueAsNumber: true })}
                        className={cn('pl-10', errors.monthlyBudget ? 'border-red-400 focus:border-red-400 focus:ring-red-400/20' : '')}
                      />
                    </div>
                  </Field>

                  {(() => {
                    const objLabels = getObjectiveLabels(values.objective ?? '');
                    return (
                      <>
                        <Field
                          label={objLabels.label}
                          hint={objLabels.description}
                          error={errors.targetCpa?.message}
                        >
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6E7681] font-semibold text-sm">R$</span>
                            <Input
                              type="number"
                              min={1}
                              step={1}
                              placeholder="50"
                              {...register('targetCpa', { valueAsNumber: true })}
                              className={cn('pl-10', errors.targetCpa ? 'border-red-400 focus:border-red-400 focus:ring-red-400/20' : '')}
                            />
                          </div>
                        </Field>

                        {values.monthlyBudget > 0 && values.targetCpa > 0 && values.targetCpa <= values.monthlyBudget && (
                          <div className="bg-[#E8631A]/8 border border-[#E8631A]/20 rounded-xl px-4 py-3 text-sm text-[#1C1C1E]">
                            Com esse orçamento, você pode atingir até{' '}
                            <span className="font-bold text-[#E8631A]">
                              {Math.floor(values.monthlyBudget / values.targetCpa)} {objLabels.conversion}s por mês
                            </span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* ── Step 3: Revisão ─────────────────────────────────────── */}
              {step === 3 && (
                <div className="space-y-4">
                  <p className="text-sm text-[#6E7681]">Confirme os dados antes de salvar:</p>

                  <div className="bg-[#F6F8FA] rounded-2xl divide-y divide-[#E0E0E0] overflow-hidden">
                    <ReviewRow label="Objetivo" value={translateObjective(values.objective)} />
                    <ReviewRow label="Nicho" value={values.niche} />
                    <ReviewRow label="Produto principal" value={values.mainProduct} />
                    <ReviewRow label="Orçamento mensal" value={fmtBRL(values.monthlyBudget)} />
                    <ReviewRow label={getObjectiveLabels(values.objective ?? '').label} value={fmtBRL(values.targetCpa)} />
                  </div>
                </div>
              )}

              {/* ── Navigation ──────────────────────────────────────────── */}
              <div className="flex gap-3 pt-2">
                {step > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="md"
                    onClick={handleBack}
                    disabled={isSaving}
                    className="flex items-center gap-1.5"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    {step === 3 ? 'Voltar e editar' : 'Voltar'}
                  </Button>
                )}

                {step < 3 ? (
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={handleNext}
                    className="flex-1 flex items-center justify-center gap-1.5"
                  >
                    Próximo
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={handleSubmit(onSubmit)}
                    disabled={isSaving}
                    className="flex-1 flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        {isEditing ? 'Atualizar Metas' : 'Confirmar e Salvar'}
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {step === 1 && (
          <p className="text-center text-xs text-[#9CA3AF] mt-5">
            Você pode atualizar suas metas a qualquer momento em{' '}
            <span className="font-semibold">Dashboard → Minhas Metas</span>
          </p>
        )}
      </div>
    </AppLayout>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-semibold text-[#1C1C1E]">{label}</label>
      {hint && <p className="text-xs text-[#6E7681]">{hint}</p>}
      {children}
      {error && (
        <p className="text-xs font-medium text-red-500 flex items-center gap-1 mt-1">
          <span className="w-1 h-1 rounded-full bg-red-500 flex-shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center px-4 py-3.5">
      <span className="text-sm text-[#6E7681]">{label}</span>
      <span className="text-sm font-semibold text-[#1C1C1E] text-right max-w-[60%] truncate">{value}</span>
    </div>
  );
}
