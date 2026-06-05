import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, CheckCircle2, XCircle, ArrowLeft, Send } from 'lucide-react';
import { AppLayout, PageHeader, Button, Card } from '@/components';
import api from '@/lib/api';
import type { StudioImageGenerationResponse, StudioComplianceStatusResponse } from '@/types/studio';

const FORMAT_OPTIONS = [
  { value: 'feed', label: 'Feed 1:1' },
  { value: 'stories', label: 'Stories 9:16' },
  { value: 'banner', label: 'Banner 1.91:1' },
];

const STYLE_OPTIONS = [
  { value: 'fotografico', label: 'Fotográfico' },
  { value: 'ilustracao', label: 'Ilustração' },
  { value: 'minimalista', label: 'Minimalista' },
];

interface FormValues {
  prompt: string;
  format: 'feed' | 'stories' | 'banner';
  style: 'fotografico' | 'ilustracao' | 'minimalista';
}

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

export function GeradorImagem() {
  const navigate = useNavigate();
  const [creativeAssetId, setCreativeAssetId] = useState<string | null>(null);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: { prompt: '', format: 'feed', style: 'fotografico' },
  });

  const prompt = watch('prompt');
  const format = watch('format');
  const style = watch('style');

  const generateMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const res = await api.post<StudioImageGenerationResponse>('/studio/generate-image', {
        prompt: values.prompt,
        format: values.format,
        style: values.style,
      });
      return res.data;
    },
    onSuccess: (data) => {
      setCreativeAssetId(data.creativeAssetId);
      setGeneratedImageUrl(data.imageUrl);
      setPublishedUrl(null);
    },
  });

  const { data: compliance } = useQuery<StudioComplianceStatusResponse>({
    queryKey: ['studio-asset', creativeAssetId],
    queryFn: async () => {
      const res = await api.get<StudioComplianceStatusResponse>(`/studio/assets/${creativeAssetId}`);
      return res.data;
    },
    enabled: !!creativeAssetId,
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
      setPublishedUrl(data.adsManagerUrl ?? null);
    },
  });

  const handleDiscard = () => {
    setCreativeAssetId(null);
    setGeneratedImageUrl(null);
    setPublishedUrl(null);
    generateMutation.reset();
    publishMutation.reset();
  };

  const onSubmit = (values: FormValues) => {
    handleDiscard();
    generateMutation.mutate(values);
  };

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
      <div className="space-y-8">
        <PageHeader
          title="Gerador de Imagens com IA"
          description="Descreva a imagem que você deseja gerar e escolha o formato e estilo"
        />

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Form */}
            <div className="lg:col-span-1">
              <Card>
                <div className="p-6 space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text-primary">
                      Descreva sua criação <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      {...register('prompt', {
                        required: 'A descrição é obrigatória',
                        minLength: { value: 10, message: 'Mínimo 10 caracteres' },
                        maxLength: { value: 1000, message: 'Máximo 1000 caracteres' },
                      })}
                      placeholder="Ex: Uma mulher jovem usando roupa de verão na praia com pôr do sol, fotografia profissional"
                      className={`w-full px-3 py-2 rounded-lg border text-sm resize-none h-24 focus:outline-none transition-colors ${
                        errors.prompt
                          ? 'border-red-500 focus:ring-2 focus:ring-red-200'
                          : 'border-border focus:ring-2 focus:ring-[#E8631A]/20'
                      }`}
                    />
                    {errors.prompt && (
                      <p className="text-xs text-red-500">{errors.prompt.message}</p>
                    )}
                    <p className="text-xs text-text-secondary">{prompt.length}/1000 caracteres</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text-primary">Formato</label>
                    <select
                      {...register('format')}
                      className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[#E8631A]/20 bg-white"
                    >
                      {FORMAT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text-primary">Estilo</label>
                    <select
                      {...register('style')}
                      className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-[#E8631A]/20 bg-white"
                    >
                      {STYLE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>

                  <Button
                    type="submit"
                    disabled={generateMutation.isPending}
                    className="w-full bg-[#E8631A] hover:bg-[#D45714] disabled:opacity-50"
                  >
                    {generateMutation.isPending ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Gerando...
                      </span>
                    ) : 'Gerar'}
                  </Button>
                </div>
              </Card>
            </div>

            {/* Right: Preview */}
            <div className="lg:col-span-2">
              {generateMutation.isPending ? (
                <Card>
                  <div className="p-12 flex flex-col items-center justify-center gap-4 text-center min-h-[300px]">
                    <Loader2 className="w-10 h-10 text-[#E8631A] animate-spin" />
                    <p className="text-sm font-medium text-text-primary">Gerando sua criação com IA...</p>
                    <p className="text-xs text-text-secondary">Isso pode levar alguns segundos</p>
                  </div>
                </Card>
              ) : generateMutation.isError ? (
                <Card>
                  <div className="p-8 flex flex-col items-center justify-center gap-3 text-center min-h-[300px]">
                    <XCircle className="w-10 h-10 text-red-400" />
                    <p className="text-sm font-semibold text-red-700">Erro ao gerar imagem</p>
                    <p className="text-xs text-text-secondary">Verifique sua conexão e tente novamente.</p>
                    <Button variant="outline" size="sm" onClick={handleDiscard}>
                      Tentar novamente
                    </Button>
                  </div>
                </Card>
              ) : generatedImageUrl ? (
                <Card>
                  <div className="space-y-0">
                    <div className="w-full bg-surface-secondary rounded-t-xl overflow-hidden aspect-video">
                      <img
                        src={generatedImageUrl}
                        alt="Criativo gerado"
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="p-6 space-y-4">
                      <div className="text-xs text-text-secondary space-y-1">
                        <p><span className="font-medium">Formato:</span> {FORMAT_OPTIONS.find((o) => o.value === format)?.label}</p>
                        <p><span className="font-medium">Estilo:</span> {STYLE_OPTIONS.find((o) => o.value === style)?.label}</p>
                      </div>

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
                          <Button type="submit" variant="outline" className="flex-1">
                            Gerar novamente
                          </Button>
                          <Button type="button" variant="outline" className="px-3" onClick={handleDiscard}>
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ) : (
                <Card>
                  <div className="p-12 flex flex-col items-center justify-center text-center space-y-4 min-h-[300px]">
                    <div className="w-16 h-16 bg-[#FEF0E7] rounded-2xl flex items-center justify-center">
                      <svg className="w-8 h-8 text-[#E8631A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-text-primary mb-1">Pronto para criar?</h3>
                      <p className="text-sm text-text-secondary">
                        Preencha os detalhes ao lado e clique em "Gerar" para criar sua primeira imagem
                      </p>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
