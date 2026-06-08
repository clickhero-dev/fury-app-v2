import { useState, useRef } from 'react';
import { ArrowLeft, ArrowRight, ImageIcon, Upload, Wand2, X } from 'lucide-react';
import { Button } from '@/components';
import type { GenerateCreativePayload, StyleTemplate } from '@/types/studio';

interface WizardData {
  product: string;
  promise: string;
  hasOffer: boolean;
  offer: string;
  audience: string;
  imageChoice: 'none' | 'upload';
  imageFile: File | null;
  imagePreviewUrl: string | null;
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
};

const STEPS = [
  'O que você vai anunciar?',
  'Qual a promessa?',
  'Tem oferta especial?',
  'Para quem é esse anúncio?',
  'Você tem imagem?',
];

interface Props {
  selectedTemplate: StyleTemplate | null;
  onGenerate: (payload: GenerateCreativePayload) => void;
  onBack: () => void;
}

export function CreativeWizard({ selectedTemplate, onGenerate, onBack }: Props) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [visible, setVisible] = useState(true);
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
    if (step === 0) return data.product.trim().length >= 5;
    if (step === 1) return data.promise.trim().length >= 5;
    if (step === 2) return !data.hasOffer || data.offer.trim().length >= 3;
    if (step === 3) return data.audience.trim().length >= 5;
    return true;
  })();

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setData((d) => ({ ...d, imageFile: file, imagePreviewUrl: url, imageChoice: 'upload' }));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'image/jpeg' || file.type === 'image/png') && file.size <= 10 * 1024 * 1024) {
      handleFileChange(file);
    }
  };

  const handleSubmit = () => {
    onGenerate({
      product: data.product.trim(),
      promise: data.promise.trim(),
      offer: data.hasOffer ? data.offer.trim() : undefined,
      audience: data.audience.trim(),
      hasProductImage: false,
    });
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEPS.map((_label, i) => (
          <div key={i} className="flex items-center gap-2 min-w-0">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                i < step
                  ? 'bg-[#E8631A] text-white'
                  : i === step
                  ? 'bg-[#E8631A] text-white ring-4 ring-[#E8631A]/20'
                  : 'bg-[#F2F4F7] text-[#667085]'
              }`}
            >
              {i < step ? '✓' : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px flex-1 min-w-[12px] max-w-[32px] transition-colors ${i < step ? 'bg-[#E8631A]' : 'bg-[#E6E8EC]'}`} />
            )}
          </div>
        ))}
      </div>

      {selectedTemplate && (
        <div className="flex items-center gap-2 rounded-xl border border-[#E8631A]/30 bg-[#FFF4ED] px-3 py-2 text-sm text-[#7A4A27]">
          <span className="text-[#E8631A]">●</span>
          Estilo selecionado: <strong>{selectedTemplate.name}</strong>
        </div>
      )}

      {/* Step content */}
      <div
        className="transition-all duration-[180ms]"
        style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateX(0)' : 'translateX(20px)' }}
      >
        {step === 0 && (
          <StepCard title={STEPS[0]} hint="Seja específico: produto, serviço, nicho, oferta principal.">
            <textarea
              autoFocus
              value={data.product}
              onChange={(e) => setData((d) => ({ ...d, product: e.target.value }))}
              placeholder="Ex: Curso online de confeitaria, Clínica de estética, Loja de roupas femininas..."
              className="w-full min-h-[120px] rounded-xl border border-[#E6E8EC] bg-[#FCFCFD] px-4 py-3 text-sm text-[#101828] outline-none transition focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/10 resize-none"
            />
          </StepCard>
        )}

        {step === 1 && (
          <StepCard title={STEPS[1]} hint="Qual transformação ou resultado o cliente vai ter?">
            <textarea
              autoFocus
              value={data.promise}
              onChange={(e) => setData((d) => ({ ...d, promise: e.target.value }))}
              placeholder="Ex: Aprenda a fazer bolos profissionais em 30 dias, Perca 5kg em 6 semanas..."
              className="w-full min-h-[120px] rounded-xl border border-[#E6E8EC] bg-[#FCFCFD] px-4 py-3 text-sm text-[#101828] outline-none transition focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/10 resize-none"
            />
          </StepCard>
        )}

        {step === 2 && (
          <StepCard title={STEPS[2]} hint="Promoções, preços especiais ou condições aumentam a conversão.">
            <div className="space-y-4">
              <div className="flex gap-3">
                {(['Sim', 'Não'] as const).map((opt) => {
                  const isYes = opt === 'Sim';
                  const active = data.hasOffer === isYes;
                  return (
                    <button
                      key={opt}
                      onClick={() => setData((d) => ({ ...d, hasOffer: isYes }))}
                      className={`flex-1 rounded-xl border-2 py-4 text-sm font-semibold transition-all ${
                        active ? 'border-[#E8631A] bg-[#FFF4ED] text-[#E8631A]' : 'border-[#E6E8EC] text-[#667085] hover:border-[#F0B48E]'
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
                  placeholder="Ex: R$ 97 por tempo limitado, 50% de desconto até domingo..."
                  className="w-full min-h-[100px] rounded-xl border border-[#E6E8EC] bg-[#FCFCFD] px-4 py-3 text-sm text-[#101828] outline-none transition focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/10 resize-none"
                />
              )}
            </div>
          </StepCard>
        )}

        {step === 3 && (
          <StepCard title={STEPS[3]} hint="Quanto mais específico o público, mais certeiro o criativo.">
            <textarea
              autoFocus
              value={data.audience}
              onChange={(e) => setData((d) => ({ ...d, audience: e.target.value }))}
              placeholder="Ex: Mulheres de 25 a 45 anos que querem aprender confeitaria em casa..."
              className="w-full min-h-[120px] rounded-xl border border-[#E6E8EC] bg-[#FCFCFD] px-4 py-3 text-sm text-[#101828] outline-none transition focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/10 resize-none"
            />
          </StepCard>
        )}

        {step === 4 && (
          <StepCard title={STEPS[4]} hint="Usar uma imagem do seu produto aumenta a identidade da marca.">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setData((d) => ({ ...d, imageChoice: 'upload' }))}
                  className={`rounded-xl border-2 p-4 text-center transition-all ${
                    data.imageChoice === 'upload'
                      ? 'border-[#E8631A] bg-[#FFF4ED]'
                      : 'border-[#E6E8EC] hover:border-[#F0B48E]'
                  }`}
                >
                  <Upload className="mx-auto mb-2 h-5 w-5 text-[#E8631A]" />
                  <p className="text-sm font-semibold text-[#101828]">Usar minha imagem</p>
                </button>
                <button
                  onClick={() => setData((d) => ({ ...d, imageChoice: 'none', imageFile: null, imagePreviewUrl: null }))}
                  className={`rounded-xl border-2 p-4 text-center transition-all ${
                    data.imageChoice === 'none'
                      ? 'border-[#E8631A] bg-[#FFF4ED]'
                      : 'border-[#E6E8EC] hover:border-[#F0B48E]'
                  }`}
                >
                  <Wand2 className="mx-auto mb-2 h-5 w-5 text-[#E8631A]" />
                  <p className="text-sm font-semibold text-[#101828]">Gerar sem imagem</p>
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
                        onClick={() => setData((d) => ({ ...d, imageFile: null, imagePreviewUrl: null }))}
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
                      className="flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#E6E8EC] bg-[#FCFCFD] transition hover:border-[#E8631A] hover:bg-[#FFF9F6]"
                    >
                      <ImageIcon className="mb-2 h-8 w-8 text-[#E8631A]/50" />
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

        {step < 4 ? (
          <Button
            onClick={advance}
            disabled={!canAdvance}
            className="flex-1 bg-[#E8631A] hover:bg-[#D45714] disabled:opacity-50"
          >
            Continuar
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            className="flex-1 bg-[#E8631A] hover:bg-[#D45714]"
          >
            <Wand2 className="mr-2 h-4 w-4" />
            Gerar Criativo
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
