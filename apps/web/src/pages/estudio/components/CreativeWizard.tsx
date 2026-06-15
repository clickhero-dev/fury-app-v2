import { useState, useRef } from 'react';
import { ArrowLeft, ArrowRight, ImageIcon, Loader2, Images, Upload, Wand2, X } from 'lucide-react';
import { Button } from '@/components';
import api from '@/lib/api';
import { useBrandKit } from '@/hooks/useBrandKit';
import type {
  AdaptiveQuestion,
  CreativeCopyFields,
  GenerateCreativePayload,
  SelectLayoutResponse,
  SuggestedFields,
  ValidateContextResponse,
} from '@/types/studio';
import type { CreativeLayout } from '@/lib/layout-labels';
import { AdaptiveQuestions } from './AdaptiveQuestions';
import { LayoutSuggestion } from './LayoutSuggestion';
import { LayoutPicker } from './LayoutPicker';
import { CreativeFieldsForm } from './CreativeFieldsForm';

interface WizardData {
  product: string;
  promise: string;
  hasOffer: boolean;
  offer: string;
  audience: string;
  imageChoice: 'none' | 'upload' | 'library';
  imageFile: File | null;
  imagePreviewUrl: string | null;
  imageBase64: string | null;
  libraryImageUrl: string | null;
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
  libraryImageUrl: null,
};

const STEPS = ['Produto', 'Promessa', 'Oferta', 'Público', 'Imagem'];
const TOTAL_STEPS = STEPS.length; // 5

interface Props {
  onGenerate: (payload: GenerateCreativePayload) => void;
  submitting: boolean;
  onBack: () => void;
}

// 'steps' = briefing; depois o fluxo de layout (sugestão → picker → campos).
type InternalState = 'steps' | 'validating' | 'questions' | 'selecting' | 'suggestion' | 'picker' | 'fields';

export function CreativeWizard({ onGenerate, submitting, onBack }: Props) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [visible, setVisible] = useState(true);
  const [internalState, setInternalState] = useState<InternalState>('steps');
  const [adaptiveQuestions, setAdaptiveQuestions] = useState<AdaptiveQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string> | undefined>(undefined);
  const [suggestion, setSuggestion] = useState<SelectLayoutResponse | null>(null);
  const [chosenLayout, setChosenLayout] = useState<CreativeLayout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { brandKit } = useBrandKit();
  const libraryPhotos = brandKit?.photo_urls ?? [];
  const hasLogo = !!brandKit?.logo_url;

  const imageUrl = data.imageChoice === 'library' ? data.libraryImageUrl : data.imageBase64;

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
    if (step === 0) return data.product.trim().length >= 5;
    if (step === 1) return data.promise.trim().length >= 5;
    if (step === 2) return !data.hasOffer || data.offer.trim().length >= 3;
    if (step === 3) return data.audience.trim().length >= 5;
    if (step === 4) return data.imageChoice !== 'library' || !!data.libraryImageUrl;
    return true;
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

  const briefing = () => ({
    product: data.product.trim(),
    promise: data.promise.trim(),
    offer: data.hasOffer ? data.offer.trim() : undefined,
    audience: data.audience.trim(),
  });

  const runSelectLayout = async (mergedAnswers?: Record<string, string>) => {
    setAnswers(mergedAnswers);
    setInternalState('selecting');
    const b = briefing();
    try {
      const res = await api.post<SelectLayoutResponse>('/studio/select-layout', {
        product: mergedAnswers?.product || b.product,
        promise: mergedAnswers?.promise || b.promise,
        offer: mergedAnswers?.offer || b.offer,
        audience: mergedAnswers?.audience || b.audience,
        hasProductImage: !!imageUrl,
        productImageUrl: imageUrl ?? undefined,
      });
      setSuggestion(res.data);
      setInternalState('suggestion');
    } catch {
      // Sem sugestão → escolha manual direta.
      setSuggestion(null);
      setInternalState('picker');
    }
  };

  const handleBriefingDone = async () => {
    setInternalState('validating');
    const b = briefing();
    try {
      const res = await api.post<ValidateContextResponse>('/studio/creative/validate-context', b);
      if (res.data.sufficient || !res.data.questions?.length) {
        await runSelectLayout();
      } else {
        setAdaptiveQuestions(res.data.questions);
        setInternalState('questions');
      }
    } catch {
      await runSelectLayout();
    }
  };

  const handleAdaptiveComplete = (a: Record<string, string>) => {
    void runSelectLayout(a);
  };

  const handleFieldsSubmit = (copy: CreativeCopyFields) => {
    if (!chosenLayout) return;
    const b = briefing();
    const payload: GenerateCreativePayload = {
      ...b,
      hasProductImage: !!imageUrl,
      productImageUrl: imageUrl ?? undefined,
      layout: chosenLayout,
      ...copy,
      skipCopy: true,
      includeLogo: true,
      adaptiveAnswers: answers,
    };
    onGenerate(payload);
  };

  // ── Sub-telas do fluxo de layout ──────────────────────────────────────────
  if (internalState === 'validating' || internalState === 'selecting') {
    const msg = internalState === 'validating'
      ? { title: 'Analisando suas informações...', sub: 'Verificando se temos tudo para criar seu anúncio' }
      : { title: 'Escolhendo o melhor formato...', sub: 'A IA está analisando seu briefing e seus assets' };
    return (
      <div className="max-w-xl mx-auto flex min-h-[300px] flex-col items-center justify-center text-center space-y-4">
        <div className="rounded-full bg-[#FFF4ED] p-4">
          <Loader2 className="h-8 w-8 animate-spin text-[#EA580C]" />
        </div>
        <div>
          <p className="text-base font-semibold text-[#101828]">{msg.title}</p>
          <p className="text-sm text-[#667085] mt-1">{msg.sub}</p>
        </div>
      </div>
    );
  }

  if (internalState === 'questions') {
    return <AdaptiveQuestions questions={adaptiveQuestions} onComplete={handleAdaptiveComplete} />;
  }

  if (internalState === 'suggestion' && suggestion) {
    return (
      <LayoutSuggestion
        suggestion={suggestion}
        onAccept={() => {
          setChosenLayout(suggestion.layout);
          setInternalState('fields');
        }}
        onChooseManually={() => setInternalState('picker')}
      />
    );
  }

  if (internalState === 'picker') {
    return (
      <LayoutPicker
        selected={chosenLayout}
        onSelect={setChosenLayout}
        onContinue={() => chosenLayout && setInternalState('fields')}
        hasImage={!!imageUrl}
        hasLogo={hasLogo}
      />
    );
  }

  if (internalState === 'fields' && chosenLayout) {
    return (
      <CreativeFieldsForm
        layout={chosenLayout}
        initial={(suggestion?.suggested_fields ?? {}) as SuggestedFields}
        imageUrl={imageUrl}
        submitting={submitting}
        onSubmit={handleFieldsSubmit}
        onBack={() => setInternalState(suggestion ? 'suggestion' : 'picker')}
      />
    );
  }

  // ── Briefing (steps) ────────────────────────────────────────────────────
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

      <div
        className="transition-all duration-[180ms]"
        style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateX(0)' : 'translateX(20px)' }}
      >
        {step === 0 && (
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

        {step === 1 && (
          <StepCard title="O que você oferece de especial?" hint="Pode ser um preço, uma condição, um atendimento diferente ou um resultado garantido">
            <textarea
              autoFocus
              value={data.promise}
              onChange={(e) => setData((d) => ({ ...d, promise: e.target.value }))}
              placeholder="Ex: Corte por R$ 35 com agendamento fácil pelo WhatsApp, Primeira consulta sem custo..."
              className="w-full min-h-[120px] rounded-xl border border-[#E6E8EC] bg-[#FCFCFD] px-4 py-3 text-sm text-[#101828] outline-none transition focus:border-[#EA580C] focus:ring-2 focus:ring-[#EA580C]/10 resize-none"
            />
          </StepCard>
        )}

        {step === 2 && (
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
                  placeholder="Ex: 20% de desconto essa semana, Leve 2 pague 1, Frete grátis para o bairro..."
                  className="w-full min-h-[100px] rounded-xl border border-[#E6E8EC] bg-[#FCFCFD] px-4 py-3 text-sm text-[#101828] outline-none transition focus:border-[#EA580C] focus:ring-2 focus:ring-[#EA580C]/10 resize-none"
                />
              )}
            </div>
          </StepCard>
        )}

        {step === 3 && (
          <StepCard title="Quem você quer atingir?" hint="Quanto mais específico, mais certeiro o anúncio — pode ser simples">
            <textarea
              autoFocus
              value={data.audience}
              onChange={(e) => setData((d) => ({ ...d, audience: e.target.value }))}
              placeholder="Ex: Homens da região que cuidam da aparência, Mães que precisam de praticidade..."
              className="w-full min-h-[120px] rounded-xl border border-[#E6E8EC] bg-[#FCFCFD] px-4 py-3 text-sm text-[#101828] outline-none transition focus:border-[#EA580C] focus:ring-2 focus:ring-[#EA580C]/10 resize-none"
            />
          </StepCard>
        )}

        {step === 4 && (
          <StepCard title="Você tem uma foto para usar?" hint="Uma foto do seu produto, serviço ou espaço deixa o anúncio muito mais real e confiável">
            <div className="space-y-4">
              <div className={`grid gap-3 ${libraryPhotos.length > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {libraryPhotos.length > 0 && (
                  <button
                    onClick={() => setData((d) => ({ ...d, imageChoice: 'library', imageFile: null, imagePreviewUrl: null, imageBase64: null }))}
                    className={`rounded-xl border-2 p-4 text-center transition-all ${
                      data.imageChoice === 'library' ? 'border-[#EA580C] bg-[#FFF4ED]' : 'border-[#E6E8EC] hover:border-[#F0B48E]'
                    }`}
                  >
                    <Images className="mx-auto mb-2 h-5 w-5 text-[#EA580C]" />
                    <p className="text-sm font-semibold text-[#101828]">Escolher da biblioteca</p>
                  </button>
                )}
                <button
                  onClick={() => setData((d) => ({ ...d, imageChoice: 'upload', libraryImageUrl: null }))}
                  className={`rounded-xl border-2 p-4 text-center transition-all ${
                    data.imageChoice === 'upload' ? 'border-[#EA580C] bg-[#FFF4ED]' : 'border-[#E6E8EC] hover:border-[#F0B48E]'
                  }`}
                >
                  <Upload className="mx-auto mb-2 h-5 w-5 text-[#EA580C]" />
                  <p className="text-sm font-semibold text-[#101828]">{libraryPhotos.length > 0 ? 'Fazer novo upload' : 'Usar minha imagem'}</p>
                </button>
                <button
                  onClick={() => setData((d) => ({ ...d, imageChoice: 'none', imageFile: null, imagePreviewUrl: null, imageBase64: null, libraryImageUrl: null }))}
                  className={`rounded-xl border-2 p-4 text-center transition-all ${
                    data.imageChoice === 'none' ? 'border-[#EA580C] bg-[#FFF4ED]' : 'border-[#E6E8EC] hover:border-[#F0B48E]'
                  }`}
                >
                  <Wand2 className="mx-auto mb-2 h-5 w-5 text-[#EA580C]" />
                  <p className="text-sm font-semibold text-[#101828]">Continuar sem foto</p>
                </button>
              </div>

              {data.imageChoice === 'library' && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {libraryPhotos.map((url) => (
                    <button
                      key={url}
                      onClick={() => setData((d) => ({ ...d, libraryImageUrl: url }))}
                      className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                        data.libraryImageUrl === url ? 'border-[#EA580C] ring-2 ring-[#EA580C]/30' : 'border-[#E6E8EC] hover:border-[#F0B48E]'
                      }`}
                    >
                      <img src={url} alt="Foto da biblioteca" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {data.imageChoice === 'upload' && (
                <div className="space-y-3">
                  {data.imagePreviewUrl ? (
                    <div className="relative">
                      <img src={data.imagePreviewUrl} alt="Preview" className="w-full max-h-48 object-contain rounded-xl border border-[#E6E8EC]" />
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
            onClick={() => void handleBriefingDone()}
            disabled={!canAdvance}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-[#EA580C] hover:bg-[#C2410C] text-white disabled:opacity-50"
          >
            <ArrowRight className="h-4 w-4" />
            Ver formato recomendado
          </Button>
        )}
      </div>
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
