import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, CheckCircle2, XCircle, ArrowLeft, Send, Upload, ImageIcon } from 'lucide-react';
import { AppLayout, PageHeader, Button, Card } from '@/components';
import api from '@/lib/api';
import type {
  RenderCreativePayload,
  RenderCreativeResponse,
  StudioComplianceStatusResponse,
} from '@/types/studio';

type WizardStep = 'form' | 'preview' | 'compliance';

function ComplianceBadge({ status, approved }: { status: string; approved: boolean | null }) {
  if (status === 'pending_compliance') {
    return (
      <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        Verificando compliance...
      </div>
    );
  }
  if (approved === true || status === 'approved') {
    return (
      <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-lg">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        Aprovado para publicação
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
      <XCircle className="w-4 h-4 shrink-0" />
      Reprovado pela política de anúncios
    </div>
  );
}

function StepIndicator({ step }: { step: WizardStep }) {
  const steps: { key: WizardStep; label: string }[] = [
    { key: 'form', label: 'Criar' },
    { key: 'preview', label: 'Preview' },
    { key: 'compliance', label: 'Publicar' },
  ];
  const idx = steps.findIndex((s) => s.key === step);

  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              i < idx
                ? 'bg-[#E8631A] text-white'
                : i === idx
                  ? 'bg-[#E8631A] text-white ring-4 ring-[#E8631A]/20'
                  : 'bg-gray-100 text-gray-400'
            }`}
          >
            {i < idx ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
          </div>
          <span className={`text-sm font-medium ${i === idx ? 'text-text-primary' : 'text-text-secondary'}`}>
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <div className={`w-8 h-px ${i < idx ? 'bg-[#E8631A]' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// CSS text overlay aligned to the image geometry:
//   strip top  = 55.56%  (600 / 1080)
//   cta top    = 84.44%  (912 / 1080), height 6.67% (72 / 1080)
//   cta left   = 26.85%  (290 / 1080), same on right (symmetric)
function CreativePreview({
  imageUrl,
  headline,
  cta,
}: {
  imageUrl: string;
  headline: string;
  cta: string;
}) {
  return (
    <div className="relative" style={{ aspectRatio: '1/1' }}>
      <img src={imageUrl} alt="Criativo gerado" className="w-full h-full block object-cover" />
      {/* Headline — vertically centered in the brand strip above the CTA pill */}
      <div
        className="absolute inset-x-0 flex items-center justify-center px-8 pointer-events-none"
        style={{ top: '55.6%', height: '28.84%' }}
      >
        <p
          className="text-white font-bold text-center leading-snug"
          style={{
            fontSize: 'clamp(14px, 5.9vw, 40px)',
            textShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        >
          {headline}
        </p>
      </div>
      {/* CTA text — centered inside the pill shape */}
      <div
        className="absolute flex items-center justify-center text-white font-bold pointer-events-none"
        style={{
          top: '84.44%',
          height: '6.67%',
          left: '26.85%',
          right: '26.85%',
          fontSize: 'clamp(11px, 3vw, 20px)',
          textShadow: '0 1px 4px rgba(0,0,0,0.4)',
        }}
      >
        {cta}
      </div>
    </div>
  );
}

export function GeradorImagem() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<WizardStep>('form');

  // Form state
  const [productImageDataUrl, setProductImageDataUrl] = useState<string | null>(null);
  const [headline, setHeadline] = useState('');
  const [cta, setCta] = useState('Saiba mais');
  const [brandColor, setBrandColor] = useState('#E8631A');

  // Result state
  const [creativeAssetId, setCreativeAssetId] = useState<string | null>(null);
  const [renderedImageUrl, setRenderedImageUrl] = useState<string | null>(null);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);

  // Validation errors
  const [errors, setErrors] = useState<{ headline?: string; cta?: string; image?: string }>({});

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setProductImageDataUrl(reader.result as string);
      setErrors((prev) => ({ ...prev, image: undefined }));
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      setProductImageDataUrl(reader.result as string);
      setErrors((prev) => ({ ...prev, image: undefined }));
    };
    reader.readAsDataURL(file);
  }

  const renderMutation = useMutation({
    mutationFn: async (payload: RenderCreativePayload) => {
      const res = await api.post<RenderCreativeResponse>('/studio/render-creative', payload);
      return res.data;
    },
    onSuccess: (data) => {
      setCreativeAssetId(data.creativeAssetId);
      setRenderedImageUrl(data.imageUrl);
      setStep('preview');
    },
  });

  const { data: compliance } = useQuery<StudioComplianceStatusResponse>({
    queryKey: ['studio-asset', creativeAssetId],
    queryFn: async () => {
      const res = await api.get<StudioComplianceStatusResponse>(`/studio/assets/${creativeAssetId}`);
      return res.data;
    },
    enabled: !!creativeAssetId && step === 'compliance',
    refetchInterval: (query) => {
      const d = query.state.data;
      if (!d) return 2000;
      return d.complianceStatus === 'pending_compliance' ? 2000 : false;
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/studio/publish/${creativeAssetId}`);
      return res.data;
    },
    onSuccess: (data) => {
      setPublishedUrl(data?.adsManagerUrl ?? null);
    },
  });

  function validate() {
    const next: typeof errors = {};
    if (!productImageDataUrl) next.image = 'Adicione uma foto do produto';
    if (!headline.trim()) next.headline = 'Headline é obrigatória';
    else if (headline.length > 80) next.headline = 'Máximo 80 caracteres';
    if (!cta.trim()) next.cta = 'CTA é obrigatório';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleGenerate() {
    if (!validate()) return;
    renderMutation.mutate({
      headline: headline.trim(),
      cta: cta.trim(),
      brandColor,
      imageUrl: productImageDataUrl!,
    });
  }

  function handleReset() {
    setStep('form');
    setCreativeAssetId(null);
    setRenderedImageUrl(null);
    setPublishedUrl(null);
    renderMutation.reset();
    publishMutation.reset();
  }

  const complianceStatus = compliance?.complianceStatus ?? (creativeAssetId ? 'pending_compliance' : null);
  const isApproved = compliance?.approved === true || complianceStatus === 'approved';

  return (
    <AppLayout
      header={
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/estudio')}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>
          <span className="text-border">·</span>
          <h2 className="text-lg font-bold text-text-primary">Gerar Novo Criativo</h2>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <PageHeader
            title="Gerador de Criativos com IA"
            description="Monte seu anúncio em 3 passos: foto, texto e publicação"
          />
          <StepIndicator step={step} />
        </div>

        {/* STEP 1: FORM */}
        {step === 'form' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Photo upload */}
            <div className="lg:col-span-1 space-y-4">
              <Card>
                <div className="p-6 space-y-5">
                  <p className="text-sm font-semibold text-text-primary">
                    Foto do Produto <span className="text-red-500">*</span>
                  </p>

                  <div
                    className={`relative rounded-xl border-2 border-dashed transition-colors cursor-pointer ${
                      errors.image ? 'border-red-400 bg-red-50' : 'border-border hover:border-[#E8631A]/50 bg-gray-50'
                    }`}
                    style={{ minHeight: '180px' }}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                  >
                    {productImageDataUrl ? (
                      <img
                        src={productImageDataUrl}
                        alt="Produto"
                        className="w-full h-full object-cover rounded-xl"
                        style={{ maxHeight: '220px' }}
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
                        <div className="w-12 h-12 bg-white rounded-xl border border-border flex items-center justify-center">
                          <Upload className="w-5 h-5 text-text-secondary" />
                        </div>
                        <p className="text-sm text-text-secondary text-center">
                          Clique ou arraste a foto aqui
                        </p>
                        <p className="text-xs text-text-secondary">JPG, PNG, WebP</p>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                  {errors.image && <p className="text-xs text-red-500">{errors.image}</p>}
                  {productImageDataUrl && (
                    <button
                      type="button"
                      onClick={() => { setProductImageDataUrl(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                      className="text-xs text-text-secondary hover:text-red-500 transition-colors"
                    >
                      Remover foto
                    </button>
                  )}
                </div>
              </Card>
            </div>

            {/* Text + color */}
            <div className="lg:col-span-2">
              <Card>
                <div className="p-6 space-y-5">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text-primary">
                      Headline <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={headline}
                      onChange={(e) => {
                        setHeadline(e.target.value);
                        if (errors.headline) setErrors((p) => ({ ...p, headline: undefined }));
                      }}
                      placeholder="Ex: Cadeira ergonômica que transforma seu home office"
                      className={`w-full px-3 py-2 rounded-lg border text-sm resize-none h-20 focus:outline-none transition-colors ${
                        errors.headline
                          ? 'border-red-500 focus:ring-2 focus:ring-red-200'
                          : 'border-border focus:ring-2 focus:ring-[#E8631A]/20'
                      }`}
                      maxLength={80}
                    />
                    <div className="flex justify-between">
                      {errors.headline ? (
                        <p className="text-xs text-red-500">{errors.headline}</p>
                      ) : (
                        <span />
                      )}
                      <p className="text-xs text-text-secondary">{headline.length}/80</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text-primary">
                      CTA (botão de chamada) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={cta}
                      onChange={(e) => {
                        setCta(e.target.value);
                        if (errors.cta) setErrors((p) => ({ ...p, cta: undefined }));
                      }}
                      placeholder="Ex: Saiba mais, Compre agora, Acesse"
                      className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none transition-colors ${
                        errors.cta
                          ? 'border-red-500 focus:ring-2 focus:ring-red-200'
                          : 'border-border focus:ring-2 focus:ring-[#E8631A]/20'
                      }`}
                      maxLength={40}
                    />
                    {errors.cta && <p className="text-xs text-red-500">{errors.cta}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text-primary">Cor da marca</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={brandColor}
                        onChange={(e) => setBrandColor(e.target.value)}
                        className="w-10 h-10 rounded-lg border border-border cursor-pointer p-0.5 bg-white"
                      />
                      <input
                        type="text"
                        value={brandColor}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setBrandColor(v);
                        }}
                        className="w-28 px-3 py-2 rounded-lg border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#E8631A]/20"
                        maxLength={7}
                      />
                      <p className="text-xs text-text-secondary">Usada no fundo e botão CTA</p>
                    </div>
                  </div>

                  <div className="pt-2">
                    <Button
                      type="button"
                      onClick={handleGenerate}
                      disabled={renderMutation.isPending}
                      className="w-full bg-[#E8631A] hover:bg-[#D45714] disabled:opacity-50"
                    >
                      {renderMutation.isPending ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Montando criativo...
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <ImageIcon className="w-4 h-4" />
                          Gerar Preview
                        </span>
                      )}
                    </Button>
                    {renderMutation.isError && (
                      <p className="text-xs text-red-500 mt-2 text-center">
                        Erro ao montar criativo. Verifique a imagem e tente novamente.
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* STEP 2: PREVIEW */}
        {step === 'preview' && renderedImageUrl && (
          <div className="max-w-2xl mx-auto space-y-6">
            <Card>
              <div className="overflow-hidden rounded-t-2xl">
                <CreativePreview imageUrl={renderedImageUrl} headline={headline} cta={cta} />
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <p className="text-sm font-semibold text-text-primary mb-1">Preview do seu criativo</p>
                  <p className="text-xs text-text-secondary">
                    Antes de publicar, revisamos o compliance com as políticas do Meta.
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    onClick={() => setStep('compliance')}
                    className="flex-1 bg-[#E8631A] hover:bg-[#D45714] text-white"
                  >
                    <span className="inline-flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      Parece bom! Continuar
                    </span>
                  </Button>
                  <Button type="button" variant="outline" onClick={handleReset} className="flex-1">
                    Recomeçar
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* STEP 3: COMPLIANCE + PUBLISH */}
        {step === 'compliance' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <Card>
              {renderedImageUrl && (
                <div className="overflow-hidden rounded-t-2xl">
                  <CreativePreview imageUrl={renderedImageUrl} headline={headline} cta={cta} />
                </div>
              )}
              <div className="p-6 space-y-4">
                {complianceStatus && (
                  <ComplianceBadge status={complianceStatus} approved={compliance?.approved ?? null} />
                )}

                {compliance?.issues && compliance.issues.length > 0 && (
                  <ul className="text-xs text-red-600 space-y-1 pl-4 list-disc">
                    {compliance.issues.map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                )}

                {publishedUrl ? (
                  <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Publicado no Meta!{' '}
                    <a href={publishedUrl} target="_blank" rel="noreferrer" className="underline font-medium">
                      Ver no Ads Manager
                    </a>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    {isApproved && (
                      <Button
                        type="button"
                        onClick={() => publishMutation.mutate()}
                        disabled={publishMutation.isPending}
                        className="flex-1 bg-[#E8631A] hover:bg-[#D45714] text-white"
                      >
                        {publishMutation.isPending ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Publicando...
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <Send className="w-4 h-4" />
                            Publicar no Meta
                          </span>
                        )}
                      </Button>
                    )}
                    <Button type="button" variant="outline" onClick={handleReset} className="flex-1">
                      Criar novo
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
