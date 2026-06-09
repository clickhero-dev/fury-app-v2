import { useState, useRef } from 'react';
import { ArrowLeft, ArrowRight, ImageIcon, Loader2, Upload, Wand2, X } from 'lucide-react';
import { Button } from '@/components';
import api from '@/lib/api';
import type {
  AdaptiveQuestion,
  GenerateCreativePayload,
  StyleTemplate,
  ValidateContextResponse,
} from '@/types/studio';
import { AdaptiveQuestions } from './AdaptiveQuestions';
import { TemplateGallery } from './TemplateGallery';

interface WizardData {
  product: string;
  promise: string;
  hasOffer: boolean;
  offer: string;
  audience: string;
  imageChoice: 'none' | 'upload';
  imageFile: File | null;
  imagePreviewUrl: string | null;
  imageBase64: string | null;
}

const INITIAL_DATA: WizardData = {
  product: '',
  promise: '',
  hasOffer: false,
  offer: '',
  audience: '',
  imageChoice: 'none',
  imageFile: null,
  imagePreviewUrl: null,
  imageBase64: null,
};

// Step 0 = template gallery; steps 1-5 = briefing questions
const STEPS = [
  'Estilo',
  'Produto',
  'Promessa',
  'Oferta',
  'Público',
  'Imagem',
];

const TOTAL_STEPS = STEPS.length; // 6

interface Props {
  onGenerate: (payload: GenerateCreativePayload) => void;
  onBack: () => void;
}

type InternalState = 'steps' | 'validating' | 'questions';

export function CreativeWizard({ onGenerate, onBack }: Props) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [selectedTemplate, setSelectedTemplate] = useState<StyleTemplate | null>(null);
  const [visible, setVisible] = useState(true);
  const [internalState, setInternalState] = useState<InternalState>('steps');
  const [adaptiveQuestions, setAdaptiveQuestions] = useState<AdaptiveQuestion[]>([]);
  const [pendingPayload, setPendingPayload] = useState<GenerateCreativePayload | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const transition = (fn: () => void) => {
    setVisible(false);
    setTimeout(() => {
      fn();
      setVisible(true);
    }, 180);
  };

  const advance = () => transition(() => setStep((s) => s + 1));
  const retreat = () => {
    if (step === 0) {
      onBack();
      return;
    }
    transition(() => setStep((s) => s - 1));
  };

  const canAdvance = (() => {
    if (step === 0) return selectedTemplate !== null;
    if (step === 1) return data.product.trim().length >= 5;
    if (step === 2) return data.promise.trim().length >= 5;
    if (step === 3) return !data.hasOffer || data.offer.trim().length >= 3;
    if (step === 4) return data.audience.trim().length >= 5;
    return true; // step 5
  })();

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setData((d) => ({
        ...d,
        imageFile: file,
        imagePreviewUrl: previewUrl,
        imageBase64: e.target?.result as string,
        imageChoice: 'upload',
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'image/jpeg' || file.type === 'image/png') && file.size <= 10 * 1024 * 1024) {
      handleFileChange(file);
    }
  };

  const buildPayload = (): GenerateCreativePayload => ({
    product: data.product.trim(),
    promise: data.promise.trim(),
    offer: data.hasOffer ? data.offer.trim() : undefined,
    audience: data.audience.trim(),
    hasProductImage: !!data.imageBase64,
    productImageUrl: data.imageBase64 ?? undefined,
  });

  const handleSubmit = async () => {
    const payload = buildPayload();
    setPendingPayload(payload);
    setInternalState('validating');

    try {
      const res = await api.post<ValidateContextResponse>('/studio/creative/validate-context', {
        product: payload.product,
        promise: payload.promise,
        offer: payload.offer,
        audience: payload.audience,
        templateStyle: selectedTemplate?.id,
      });

      if (res.data.sufficient || !res.data.questions?.length) {
        onGenerate(payload);
      } else {
        setAdaptiveQuestions(res.data.questions);
        setInternalState('questions');
      }
    } catch {
      onGenerate(payload);
    }
  };

  const handleAdaptiveComplete = (answers: Record<string, string>) => {
    const base = pendingPayload!;
    const merged: GenerateCreativePayload = {
      ...base,
      product: answers.product || base.product,
      promise: answers.promise || base.promise,
      offer: answers.offer || base.offer,
      audience: answers.audience || base.audience,
      adaptiveAnswers: answers,
    };
    onGenerate(merged);
  };

  const step0ButtonLabel = selectedTemplate
    ? `Continuar com ${selectedTemplate.name}`
    : 'Selecione um estilo para continuar';

  if (internalState === 'validating') {
    return (
      <div className="max-w-xl mx-auto flex min-h-[300px] flex-col items-center justify-center text-center space-y-4">
        <div className="rounded-full bg-[#FFF4ED] p-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#EA580C]" />
        </div>
        <div>
          <p className="text-base font-semibold text-[#101828]">Analisando suas informações...</p>
          <p className="text-sm text-[#667085] mt-1">A IA está verificando se temos tudo para criar seu anúncio</p>
        </div>
      </div>
    );
  }

  if (internalState === 'questions') {
    return (
      <AdaptiveQuestions
        questions={adaptiveQuestions}
        onComplete={handleAdaptiveComplete}
      />
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Stepper */}
      <div className="flex items-center gap-1.5">
        {STEPS.map((_label, i) => (
          <div key={i} className="flex items-center gap-1.5 min-w-0">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                i < step
                  ? 'bg-[#EA580C] text-white'
                  : i === step
                  ? 'bg-[#EA580C] text-white ring-4 ring-[#EA580C]/20'
                  : 'bg-[#F2F4F7] text-[#667085]'
              }`}
            >
              {i < step ? '✓' : i + 1}
            </div>
            {i < TOTAL_STEPS - 1 && (
              <div className={`h-px flex-1 min-w-[8px] max-w-[24px] transition-colors ${i < step ? 'bg-[#EA580C]' : 'bg-[#E6E8EC]'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div
        className="transition-all duration-[180ms]"
        style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateX(0)' : 'translateX(20px)' }}
      >
        {/* STEP 0 — Template gallery */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-[#101828]">Escolha o estilo do seu anúncio</h2>
              <p className="text-sm text-[#667085] mt-1">Selecione o visual do anúncio que você quer que o FURY crie pra você</p>
            </div>
            <TemplateGallery selectedTemplate={selectedTemplate} onSelect={setSelectedTemplate} />
          </div>
        )}

        {/* STEP 1 — Product */}
        {step === 1 && (
          <StepCard title="O que você vai anunciar?" hint="Descreva o que você quer mostrar para as pessoas">
            <textarea
              autoFocus
              value={data.product}
              onChange={(e) => setData((d) => ({ ...d, product: e.target.value }))}
              placeholder="Ex: Corte de cabelo masculino, Banho e tosa para cães, Aulas de natação..."
              className="w-full min-h-[120px] rounded-xl border border-[#E6E8EC] bg-[#FCFCFD] px-4 py-3 text-sm text-[#101828] outline-none transition focus:border-[#EA580C] focus:ring-2 focus:ring-[#EA580C]/10 resize-none"
            />
          </StepCard>
        )}

        {/* STEP 2 — Promise */}
        {step === 2 && (
          <StepCard title="O que você oferece de especial?" hint="Pode ser um preço, uma condição, um atendimento diferente ou um resultado garantido">
            <textarea
              autoFocus
              value={data.promise}
              onChange={(e) => setData((d) => ({ ...d, promise: e.target.value }))}
              placeholder="Ex: Corte por R$ 35 com agendamento fácil pelo WhatsApp, Tosa com busca e entrega no bairro, Primeira consulta sem custo, Marmita por R$ 18 com entrega em 30 minutos..."
              className="w-full min-h-[120px] rounded-xl border border-[#E6E8EC] bg-[#FCFCFD] px-4 py-3 text-sm text-[#101828] outline-none transition focus:border-[#EA580C] focus:ring-2 focus:ring-[#EA580C]/10 resize-none"
            />
          </StepCard>
        )}

        {/* STEP 3 — Offer */}
        {step === 3 && (
          <StepCard title="Tem alguma promoção ou condição especial?" hint="Desconto, preço especial ou condição por tempo limitado aumentam muito os resultados">
            <div className="space-y-4">
              <div className="flex gap-3">
                {(['Sim, tenho', 'Não agora'] as const).map((opt) => {
                  const isYes = opt === 'Sim, tenho';
                  const active = data.hasOffer === isYes;
                  return (
                    <button
                      key={opt}
                      onClick={() => setData((d) => ({ ...d, hasOffer: isYes }))}
                      className={`flex-1 rounded-xl border-2 py-4 text-sm font-semibold transition-all ${
                        active ? 'border-[#EA580C] bg-[#FFF4ED] text-[#EA580C]' : 'border-[#E6E8EC] text-[#667085] hover:border-[#F0B48E]'
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              {data.hasOffer && (
                <textarea
                  autoFocus
                  value={data.offer}
                  onChange={(e) => setData((d) => ({ ...d, offer: e.target.value }))}
                  placeholder="Ex: 20% de desconto essa semana, Leve 2 pague 1, Mensalidade por R$ 89 no primeiro mês, Frete grátis para o bairro..."
                  className="w-full min-h-[100px] rounded-xl border border-[#E6E8EC] bg-[#FCFCFD] px-4 py-3 text-sm text-[#101828] outline-none transition focus:border-[#EA580C] focus:ring-2 focus:ring-[#EA580C]/10 resize-none"
                />
              )}
            </div>
          </StepCard>
        )}

        {/* STEP 4 — Audience */}
        {step === 4 && (
          <StepCard title="Quem você quer atingir?" hint="Quanto mais específico, mais certeiro o anúncio — pode ser simples">
            <textarea
              autoFocus
              value={data.audience}
              onChange={(e) => setData((d) => ({ ...d, audience: e.target.value }))}
              placeholder="Ex: Homens da região que cuidam da aparência, Mães que precisam de praticidade na alimentação, Pessoas que querem emagrecer com saúde..."
              className="w-full min-h-[120px] rounded-xl border border-[#E6E8EC] bg-[#FCFCFD] px-4 py-3 text-sm text-[#101828] outline-none transition focus:border-[#EA580C] focus:ring-2 focus:ring-[#EA580C]/10 resize-none"
            />
          </StepCard>
        )}

        {/* STEP 5 — Image */}
        {step === 5 && (
          <StepCard title="Você tem uma foto para usar?" hint="Uma foto do seu produto, serviço ou espaço deixa o anúncio muito mais real e confiável">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setData((d) => ({ ...d, imageChoice: 'upload' }))}
                  className={`rounded-xl border-2 p-4 text-center transition-all ${
                    data.imageChoice === 'upload'
                      ? 'border-[#EA580C] bg-[#FFF4ED]'
                      : 'border-[#E6E8EC] hover:border-[#F0B48E]'
                  }`}
                >
                  <Upload className="mx-auto mb-2 h-5 w-5 text-[#EA580C]" />
                  <p className="text-sm font-semibold text-[#101828]">Usar minha imagem</p>
                </button>
                <button
                  onClick={() => setData((d) => ({ ...d, imageChoice: 'none', imageFile: null, imagePreviewUrl: null, imageBase64: null }))}
                  className={`rounded-xl border-2 p-4 text-center transition-all ${
                    data.imageChoice === 'none'
                      ? 'border-[#EA580C] bg-[#FFF4ED]'
                      : 'border-[#E6E8EC] hover:border-[#F0B48E]'
                  }`}
                >
                  <Wand2 className="mx-auto mb-2 h-5 w-5 text-[#EA580C]" />
                  <p className="text-sm font-semibold text-[#101828]">Continuar sem foto</p>
                </button>
              </div>

              {data.imageChoice === 'upload' && (
                <div className="space-y-3">
                  {data.imagePreviewUrl ? (
                    <div className="relative">
                      <img
                        src={data.imagePreviewUrl}
                        alt="Preview"
                        className="w-full max-h-48 object-contain rounded-xl border border-[#E6E8EC]"
                      />
                      <button
                        onClick={() => setData((d) => ({ ...d, imageFile: null, imagePreviewUrl: null, imageBase64: null }))}
                        className="absolute top-2 right-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div
                      onDrop={handleDrop}
                      onDragOver={(e) => e.preventDefault()}
                      onClick={() => fileInputRef.current?.click()}
                      className="flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#E6E8EC] bg-[#FCFCFD] transition hover:border-[#EA580C] hover:bg-[#FFF9F6]"
                    >
                      <ImageIcon className="mb-2 h-8 w-8 text-[#EA580C]/50" />
                      <p className="text-sm font-semibold text-[#101828]">Solte a imagem aqui ou clique</p>
                      <p className="text-xs text-[#667085]">JPG ou PNG, máximo 10MB</p>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png"
                    className="hidden"
                    onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                  />
                </div>
              )}
            </div>
          </StepCard>
        )}
      </div>

      {/* Navigation */}
      {step === 0 ? (
        <Button
          onClick={advance}
          disabled={!canAdvance}
          className={`w-full inline-flex items-center justify-center gap-2 bg-[#EA580C] hover:bg-[#C2410C] text-white font-semibold ${!canAdvance ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {step0ButtonLabel}
          {canAdvance && <ArrowRight className="h-4 w-4" />}
        </Button>
      ) : (
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={retreat} className="w-10 h-10 p-0 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>

          {step < TOTAL_STEPS - 1 ? (
            <Button
              onClick={advance}
              disabled={!canAdvance}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-[#EA580C] hover:bg-[#C2410C] text-white disabled:opacity-50"
            >
              Continuar
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={() => void handleSubmit()}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-[#EA580C] hover:bg-[#C2410C] text-white"
            >
              <Wand2 className="h-4 w-4" />
              Criar meu anúncio
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function StepCard({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-[#101828]">{title}</h2>
        <p className="text-sm text-[#667085] mt-1">{hint}</p>
      </div>
      {children}
    </div>
  );
}
