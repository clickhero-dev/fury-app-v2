import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, ImagePlus, Loader2, Sparkles, UploadCloud, X } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import type { StudioAsset } from '@/types/studio';
import { useUploadCreative } from '../hooks/useCreateCampaign';
import { MAX_CREATIVES } from '../types';
import type { WizardCreativeState, WizardObjective } from '../types';
import { InstagramPostsTab } from './InstagramPostsTab';

interface StudioAssetResponse {
  assets: StudioAsset[];
}

interface SuggestResponse {
  headline: string;
  primaryText: string;
}

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;

type CopyFields = Pick<WizardCreativeState, 'headline' | 'primaryText' | 'destinationUrl'>;

interface Step2CreativeProps {
  value: WizardCreativeState[];
  onChange: (creatives: WizardCreativeState[]) => void;
  objective: WizardObjective | null;
  instagramUserId?: string;
}

export function Step2Creative({ value, onChange, objective, instagramUserId }: Step2CreativeProps) {
  const [tab, setTab] = useState<'gallery' | 'upload' | 'instagram'>('gallery');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [suggestError, setSuggestError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Texto do anúncio é ÚNICO e vale para todas as imagens selecionadas
  const [copy, setCopy] = useState<CopyFields>(() => ({
    headline: value[0]?.headline ?? '',
    primaryText: value[0]?.primaryText ?? '',
    destinationUrl: value[0]?.destinationUrl ?? '',
  }));

  const canUseInstagramPost = objective === 'engagement' || objective === 'messages' || objective === 'whatsapp';
  const atCapacity = value.length >= MAX_CREATIVES;
  const canAddMore = !atCapacity;

  const uploadMutation = useUploadCreative();

  const suggestMutation = useMutation({
    mutationFn: async ({ imageUrl }: { imageUrl: string | null }) => {
      const res = await api.post('/campaigns/suggest-text', { imageUrl });
      return res.data.data as SuggestResponse;
    },
    onSuccess: (data) => {
      setSuggestError(false);
      applyCopy({ headline: data.headline, primaryText: data.primaryText });
    },
    onError: () => setSuggestError(true),
  });

  const { data, isLoading } = useQuery<StudioAssetResponse>({
    queryKey: ['studio/assets'],
    queryFn: async () => {
      const response = await api.get('/studio/assets');
      return response.data;
    },
  });

  const galleryAssets = (data?.assets ?? []).filter(
    (asset) => asset.type === 'image' && asset.complianceStatus !== 'rejected'
  );

  const selectedImageUrl = value[0]?.assetUrl || value[0]?.uploadUrl || value[0]?.mediaUrl || null;

  const suggestErrorMessage =
    (suggestMutation.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
      ?.message || 'Não foi possível gerar sugestões agora. Tente novamente em instantes.';

  /** Aplica o texto (headline/primary/destino) a TODOS os criativos selecionados. */
  function applyCopy(updates: Partial<CopyFields>) {
    const next = { ...copy, ...updates };
    setCopy(next);
    if (value.length === 0) return;
    onChange(value.map((c) => ({ ...c, ...next })));
  }

  function handleToggleAsset(asset: StudioAsset) {
    const existing = value.find((c) => c.assetId === asset.id);
    if (existing) {
      onChange(value.filter((c) => c.id !== existing.id));
      return;
    }
    if (!canAddMore) return;

    // pré-preenche o texto com o do asset apenas se o usuário ainda não digitou nada
    const headline = copy.headline || (asset.headline || asset.title || asset.name || '').slice(0, 40);
    const primaryText = copy.primaryText || (asset.primaryText || asset.description || '').slice(0, 125);
    if (headline !== copy.headline || primaryText !== copy.primaryText) {
      setCopy({ ...copy, headline, primaryText });
    }
    onChange([
      ...value,
      {
        id: crypto.randomUUID(),
        assetId: asset.id,
        assetUrl: asset.url ?? undefined,
        headline,
        primaryText,
        destinationUrl: copy.destinationUrl,
      },
    ]);
  }

  function handleToggleInstagramPost(post: { id: string; mediaUrl?: string; caption?: string }) {
    const existing = value.find((c) => c.instagramMediaId === post.id);
    if (existing) {
      onChange(value.filter((c) => c.id !== existing.id));
      return;
    }
    if (!canAddMore) return;

    const primaryText = copy.primaryText || (post.caption ?? '').slice(0, 125);
    if (primaryText !== copy.primaryText) setCopy({ ...copy, primaryText });
    onChange([
      ...value,
      {
        id: crypto.randomUUID(),
        instagramMediaId: post.id,
        mediaUrl: post.mediaUrl,
        headline: copy.headline,
        primaryText,
        destinationUrl: copy.destinationUrl,
      },
    ]);
  }

  function handleRemove(id: string) {
    onChange(value.filter((c) => c.id !== id));
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);

    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setUploadError('Formato inválido. Envie PNG ou JPG.');
      return;
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      setUploadError('Arquivo muito grande. Máximo de 5MB.');
      return;
    }

    if (!canAddMore) {
      setUploadError(`Máximo de ${MAX_CREATIVES} criativos por campanha.`);
      return;
    }

    try {
      const url = await uploadMutation.mutateAsync(file);
      onChange([
        ...value,
        {
          id: crypto.randomUUID(),
          uploadUrl: url,
          headline: copy.headline,
          primaryText: copy.primaryText,
          destinationUrl: copy.destinationUrl,
        },
      ]);
    } catch {
      setUploadError('Erro ao enviar imagem. Tente novamente.');
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-gray-900">Qual imagem vai usar?</h3>
          {value.length > 0 && (
            <span
              role="status"
              aria-atomic="true"
              className="text-sm font-bold text-[#E8631A] whitespace-nowrap"
            >
              {value.length}/{MAX_CREATIVES} selecionadas
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Selecione até {MAX_CREATIVES} imagens. O texto abaixo vale para todas as imagens escolhidas.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'gallery' | 'upload' | 'instagram')}>
        <TabsList>
          <TabsTrigger value="gallery">Galeria</TabsTrigger>
          <TabsTrigger value="upload">Fazer Upload</TabsTrigger>
          {canUseInstagramPost && <TabsTrigger value="instagram">Post do Instagram</TabsTrigger>}
        </TabsList>

        <TabsContent value="gallery">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : galleryAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-gray-500">
              <ImagePlus className="w-8 h-8 mb-2 text-gray-300" />
              <p className="text-sm">Nenhuma imagem encontrada na galeria.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-64 overflow-y-auto pr-1">
              {galleryAssets.map((asset) => {
                const isSelected = value.some((c) => c.assetId === asset.id);
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => handleToggleAsset(asset)}
                    disabled={!isSelected && !canAddMore}
                    title={asset.name ?? 'Criativo'}
                    className={cn(
                      'relative rounded-lg overflow-hidden border-2 transition-all aspect-square bg-gray-100',
                      isSelected ? 'border-[#E8631A]' : 'border-transparent hover:border-[#E8631A]/40',
                      !isSelected && !canAddMore && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {asset.url ? (
                      <img src={asset.url} alt={asset.name ?? 'Criativo'} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <ImagePlus className="w-6 h-6" />
                      </div>
                    )}
                    {isSelected && (
                      <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#E8631A] flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="upload">
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file && fileInputRef.current) {
                const dt = new DataTransfer();
                dt.items.add(file);
                fileInputRef.current.files = dt.files;
                fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }}
            className="border-2 border-dashed border-gray-300 rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:border-[#E8631A]/50 transition-colors"
          >
            {uploadMutation.isPending ? (
              <Loader2 className="w-6 h-6 mb-2 text-gray-400 animate-spin" />
            ) : (
              <UploadCloud className="w-6 h-6 mb-2 text-gray-300" />
            )}
            <p className="text-sm font-medium text-gray-700">Arraste uma imagem ou clique para selecionar</p>
            <p className="text-xs text-gray-400 mt-1">PNG ou JPG, até 5MB — a imagem entra nos selecionados</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
          {uploadError && <p className="text-sm text-red-600 mt-2">{uploadError}</p>}
        </TabsContent>

        {canUseInstagramPost && (
          <TabsContent value="instagram">
            <InstagramPostsTab selected={value} onToggle={handleToggleInstagramPost} canAdd={canAddMore} objective={objective} instagramUserId={instagramUserId} />
          </TabsContent>
        )}
      </Tabs>

      {atCapacity && <p className="text-xs text-amber-700">Máximo de {MAX_CREATIVES} criativos atingido.</p>}

      {/* Imagens selecionadas (across tabs) */}
      {value.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Selecionadas</span>
            <span role="status" aria-atomic="true" className="text-xs font-medium text-gray-500">
              {value.length}/{MAX_CREATIVES} selecionadas
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {value.map((c) => {
              const image = c.assetUrl || c.uploadUrl || c.mediaUrl;
              return (
                <div key={c.id} className="relative w-14 h-14 rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
                  {image ? (
                    <img src={image} alt="Criativo selecionado" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <ImagePlus className="w-4 h-4" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemove(c.id)}
                    aria-label="Remover criativo"
                    title="Remover"
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-900 text-white flex items-center justify-center hover:bg-red-600 transition-colors shadow"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Texto do anúncio — único, aplicado a todas as imagens */}
      <div className="space-y-4 pt-4 border-t border-gray-100">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-bold text-gray-900">Título do anúncio</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => suggestMutation.mutate({ imageUrl: selectedImageUrl })}
                disabled={suggestMutation.isPending || !selectedImageUrl}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#E8631A] hover:text-[#D4550F] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title={!selectedImageUrl ? 'Selecione uma imagem primeiro' : 'Sugerir com IA'}
              >
                <Sparkles className="w-3.5 h-3.5" />
                {suggestMutation.isPending ? 'Gerando...' : 'Sugestão IA'}
              </button>
              <span className="text-xs text-gray-400">{copy.headline.length}/40</span>
            </div>
          </div>
          <input
            type="text"
            maxLength={40}
            value={copy.headline}
            onChange={(e) => applyCopy({ headline: e.target.value })}
            placeholder="Ex: Promoção imperdível este mês!"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 transition-all duration-200 focus:outline-none focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/20"
          />
          {suggestError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-2 mt-1 text-xs text-red-700">
              {suggestErrorMessage}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-bold text-gray-900">Texto principal</label>
            <span className="text-xs text-gray-400">{copy.primaryText.length}/125</span>
          </div>
          <textarea
            maxLength={125}
            rows={3}
            value={copy.primaryText}
            onChange={(e) => applyCopy({ primaryText: e.target.value })}
            placeholder="Descreva sua oferta de forma clara e atrativa."
            className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 transition-all duration-200 focus:outline-none focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/20 resize-none"
          />
        </div>

        {objective === 'visits' && (
          <div>
            <label className="text-sm font-bold text-gray-900 mb-1 block">Link de destino</label>
            <p className="text-xs text-gray-500 mb-2">Para onde as pessoas vão ao clicar?</p>
            <input
              type="text"
              value={copy.destinationUrl ?? ''}
              onChange={(e) => applyCopy({ destinationUrl: e.target.value })}
              placeholder="https://wa.me/55... · site · instagram.com/seu perfil"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 transition-all duration-200 focus:outline-none focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/20"
            />
            {copy.destinationUrl && !/^https?:\/\//.test(copy.destinationUrl.trim()) && (
              <p className="text-sm text-red-600 mt-1">O link deve começar com http:// ou https://</p>
            )}
            <p className="text-xs text-gray-400 mt-1">WhatsApp, site ou perfil do Instagram</p>
          </div>
        )}
      </div>
    </div>
  );
}