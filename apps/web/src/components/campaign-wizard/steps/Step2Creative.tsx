import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ImagePlus, Loader2, UploadCloud } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import type { StudioAsset } from '@/types/studio';
import { useUploadCreative } from '../hooks/useCreateCampaign';
import type { WizardCreativeState, WizardObjective } from '../types';
import { InstagramPostsTab } from './InstagramPostsTab';

interface StudioAssetResponse {
  assets: StudioAsset[];
}

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;

interface Step2CreativeProps {
  value: WizardCreativeState;
  onChange: (updates: Partial<WizardCreativeState>) => void;
  objective: WizardObjective | null;
}

export function Step2Creative({ value, onChange, objective }: Step2CreativeProps) {
  const [tab, setTab] = useState<'gallery' | 'upload' | 'instagram'>(value.uploadUrl ? 'upload' : value.instagramMediaId ? 'instagram' : 'gallery');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadCreative();

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

  function handleSelectAsset(asset: StudioAsset) {
    const headline = asset.headline || asset.title || asset.name;
    const primaryText = asset.primaryText || asset.description;

    onChange({
      assetId: asset.id,
      assetUrl: asset.url ?? undefined,
      uploadUrl: undefined,
      headline: value.headline || headline?.slice(0, 40) || '',
      primaryText: value.primaryText || primaryText?.slice(0, 125) || '',
    });
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

    try {
      const url = await uploadMutation.mutateAsync(file);
      onChange({ uploadUrl: url, assetId: undefined, assetUrl: undefined });
    } catch {
      setUploadError('Erro ao enviar imagem. Tente novamente.');
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-bold text-gray-900">Qual imagem vai usar?</h3>
        <p className="text-sm text-gray-500 mt-1">Escolha uma imagem da sua galeria ou faça upload de um novo arquivo.</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'gallery' | 'upload' | 'instagram')}>
        <TabsList>
          <TabsTrigger value="gallery">Escolher da Galeria</TabsTrigger>
          <TabsTrigger value="upload">Fazer Upload</TabsTrigger>
          <TabsTrigger value="instagram">Post do Instagram</TabsTrigger>
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-72 overflow-y-auto pr-1">
              {galleryAssets.map((asset) => {
                const isSelected = value.assetId === asset.id;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => handleSelectAsset(asset)}
                    className={cn(
                      'relative rounded-xl overflow-hidden border-2 transition-all aspect-square bg-gray-100',
                      isSelected ? 'border-[#E8631A]' : 'border-transparent hover:border-[#E8631A]/40'
                    )}
                  >
                    {asset.url ? (
                      <img src={asset.url} alt={asset.name ?? 'Criativo'} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <ImagePlus className="w-8 h-8" />
                      </div>
                    )}
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#E8631A] flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-2 py-1 truncate">
                      {asset.name || 'Sem nome'}
                    </div>
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
            className="border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:border-[#E8631A]/50 transition-colors"
          >
            {uploadMutation.isPending ? (
              <Loader2 className="w-8 h-8 mb-2 text-gray-400 animate-spin" />
            ) : value.uploadUrl ? (
              <img src={value.uploadUrl} alt="Imagem enviada" className="max-h-40 rounded-lg mb-2 object-contain" />
            ) : (
              <UploadCloud className="w-8 h-8 mb-2 text-gray-300" />
            )}
            <p className="text-sm font-medium text-gray-700">
              {value.uploadUrl ? 'Clique para trocar a imagem' : 'Arraste uma imagem ou clique para selecionar'}
            </p>
            <p className="text-xs text-gray-400 mt-1">PNG ou JPG, até 5MB</p>
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

        <TabsContent value="instagram">
          <InstagramPostsTab value={value} onChange={onChange} objective={objective} />
        </TabsContent>
      </Tabs>

      <div className="space-y-4 pt-2 border-t border-gray-100">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-bold text-gray-900">Título do anúncio</label>
            <span className="text-xs text-gray-400">{value.headline.length}/40</span>
          </div>
          <input
            type="text"
            maxLength={40}
            value={value.headline}
            onChange={(e) => onChange({ headline: e.target.value })}
            placeholder="Ex: Promoção imperdível este mês!"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 transition-all duration-200 focus:outline-none focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/20"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-bold text-gray-900">Texto principal</label>
            <span className="text-xs text-gray-400">{value.primaryText.length}/125</span>
          </div>
          <textarea
            maxLength={125}
            rows={3}
            value={value.primaryText}
            onChange={(e) => onChange({ primaryText: e.target.value })}
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
              value={value.destinationUrl ?? ''}
              onChange={(e) => onChange({ destinationUrl: e.target.value })}
              placeholder="https://wa.me/55... · site · instagram.com/seu perfil"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 transition-all duration-200 focus:outline-none focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/20"
            />
            {value.destinationUrl && !/^https?:\/\//.test(value.destinationUrl.trim()) && (
              <p className="text-sm text-red-600 mt-1">O link deve começar com http:// ou https://</p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              WhatsApp, site ou perfil do Instagram
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
