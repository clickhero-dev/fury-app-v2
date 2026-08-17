import { useEffect, useRef, useState } from 'react';
import { AppLayout, PageHeader, ErrorBoundary, Button, Card, CardContent, CardHeader, CardTitle } from '@/components';
import { Select } from '@/components/ui/select';
import { useBrandKit, useSaveBrandKit, useUploadLogo, useUploadPhotos, useDeletePhoto } from '@/hooks/useBrandKit';
import type { VoiceTone } from '@/types/brandKit';
import { FURY_COLORS } from '@/lib/constants';
import { Upload, X, Trash2, Image as ImageIcon } from 'lucide-react';
import { ConfiguracoesTabsNav } from './ConfiguracoesTabsNav';

const VOICE_TONE_OPTIONS: { value: VoiceTone; label: string; description: string }[] = [
  { value: 'professional', label: 'Profissional', description: 'Formal, técnico, confiável' },
  { value: 'casual', label: 'Casual', description: 'Leve, próximo, descontraído' },
  { value: 'urgent', label: 'Urgente', description: 'Direto, impactante, gera ação' },
  { value: 'premium', label: 'Premium', description: 'Sofisticado, exclusivo, aspiracional' },
];

const MAX_PHOTOS = 20;

function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div
      className={[
        'fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-semibold text-white',
        type === 'success' ? 'bg-green-600' : 'bg-red-600',
      ].join(' ')}
    >
      {message}
    </div>
  );
}

export function BrandKitPage() {
  return (
    <ErrorBoundary>
      <AppLayout>
        <BrandKitContent />
      </AppLayout>
    </ErrorBoundary>
  );
}

export function BrandKitContent() {
  const { brandKit, isLoading } = useBrandKit();
  const saveBrandKit = useSaveBrandKit();
  const uploadLogo = useUploadLogo();
  const uploadPhotos = useUploadPhotos();
  const deletePhoto = useDeletePhoto();

  const [primaryColor, setPrimaryColor] = useState(FURY_COLORS.primary);
  const [secondaryColor, setSecondaryColor] = useState('#1C1C1E');
  const [voiceTone, setVoiceTone] = useState<VoiceTone | ''>('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);

  function fmtPhone(raw: string): string {
    const d = raw.replace(/\D/g, '');
    if (d.length <= 2) return d;
    if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
    return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7,11)}`;
  }
  const digitsOnly = whatsappNumber.replace(/\D/g, '');
  const phoneValid = digitsOnly.length === 0 || digitsOnly.length >= 10;

  useEffect(() => {
    if (!brandKit || initialized) return;
    setPrimaryColor(brandKit.primary_color ?? FURY_COLORS.primary);
    setSecondaryColor(brandKit.secondary_color ?? '#1C1C1E');
    setVoiceTone(brandKit.voice_tone ?? '');
    setWhatsappNumber(brandKit.whatsapp_number ? fmtPhone(brandKit.whatsapp_number) : '');
    setInitialized(true);
  }, [brandKit, initialized]);

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.type !== 'image/png' && file.type !== 'image/svg+xml') {
      showToast('Formato inválido. Envie PNG ou SVG.', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast('Arquivo muito grande. Máximo de 2MB.', 'error');
      return;
    }

    try {
      await uploadLogo.mutateAsync(file);
      showToast('Logo enviada com sucesso!', 'success');
    } catch {
      showToast('Erro ao enviar logo. Tente novamente.', 'error');
    }
  }

  async function handleRemoveLogo() {
    try {
      await saveBrandKit.mutateAsync({ logo_url: null });
      showToast('Logo removida.', 'success');
    } catch {
      showToast('Erro ao remover logo. Tente novamente.', 'error');
    }
  }

  async function handlePhotosSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    const currentCount = brandKit?.photo_urls?.length ?? 0;
    if (currentCount + files.length > MAX_PHOTOS) {
      showToast(`Limite de ${MAX_PHOTOS} fotos excedido. Você já tem ${currentCount} foto(s).`, 'error');
      return;
    }

    for (const file of files) {
      if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
        showToast('Formato inválido. Envie PNG ou JPG.', 'error');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        showToast('Arquivo muito grande. Máximo de 5MB por foto.', 'error');
        return;
      }
    }

    try {
      await uploadPhotos.mutateAsync(files);
      showToast('Fotos enviadas com sucesso!', 'success');
    } catch {
      showToast('Erro ao enviar fotos. Tente novamente.', 'error');
    }
  }

  async function handleDeletePhoto(url: string) {
    try {
      await deletePhoto.mutateAsync(url);
      showToast('Foto removida.', 'success');
    } catch {
      showToast('Erro ao remover foto. Tente novamente.', 'error');
    }
  }

  async function handleSave() {
    try {
      await saveBrandKit.mutateAsync({
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        ...(voiceTone ? { voice_tone: voiceTone } : {}),
        whatsapp_number: digitsOnly || null,
      });
      showToast('Dados da Marca salvos com sucesso!', 'success');
    } catch {
      showToast('Erro ao salvar. Tente novamente.', 'error');
    }
  }

  const photoUrls = brandKit?.photo_urls ?? [];

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} />}

      {isLoading ? (
        <Card>
          <CardContent>
            <p className="text-sm text-text-secondary">Carregando...</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* SEÇÃO 1 - Logo da Marca */}
          <Card>
            <CardHeader>
              <CardTitle>Logo da Marca</CardTitle>
            </CardHeader>
            <CardContent>
        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/svg+xml"
          className="hidden"
          onChange={handleLogoSelect}
        />

        {brandKit?.logo_url ? (
          <div className="flex items-center gap-4">
            <img
              src={brandKit.logo_url}
              alt="Logo da marca"
              className="w-20 h-20 object-contain rounded-lg border border-border bg-background p-2"
            />
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadLogo.isPending}
              >
                Substituir
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemoveLogo}
                disabled={saveBrandKit.isPending}
                className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                <Trash2 className="w-4 h-4 mr-1.5 inline" />
                Remover
              </Button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => logoInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file && logoInputRef.current) {
                const dt = new DataTransfer();
                dt.items.add(file);
                logoInputRef.current.files = dt.files;
                handleLogoSelect({ target: logoInputRef.current } as React.ChangeEvent<HTMLInputElement>);
              }
            }}
            className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl py-10 px-6 cursor-pointer hover:border-admin-petrol/50 hover:bg-admin-petrol/5 transition-all duration-200"
          >
            {uploadLogo.isPending ? (
              <p className="text-sm text-muted-foreground">Enviando...</p>
            ) : (
              <>
                <Upload className="w-6 h-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Arraste sua logo aqui ou clique para enviar (PNG ou SVG, máx. 2MB)
                </p>
              </>
            )}
          </div>
        )}
      </CardContent>
          </Card>

          {/* SEÇÃO 2 - Paleta de Cores */}
          <Card>
            <CardHeader>
              <CardTitle>Paleta de Cores</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-text-secondary mb-4">
                Essas cores serão usadas automaticamente nos criativos gerados.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-text-primary mb-2">Cor Principal</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-12 h-12 rounded-lg border border-gray-300 cursor-pointer p-1"
                    />
                    <span className="text-sm font-mono text-text-secondary uppercase">{primaryColor}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-text-primary mb-2">Cor Secundária</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="w-12 h-12 rounded-lg border border-gray-300 cursor-pointer p-1"
                    />
                    <span className="text-sm font-mono text-text-secondary uppercase">{secondaryColor}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SEÇÃO 3 - Tom de Voz */}
          <Card>
            <CardHeader>
              <CardTitle>Tom de Voz</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-text-secondary mb-4">
                Escolha o tom de voz que será usado na escrita dos criativos.
              </p>
              <Select value={voiceTone} onChange={(e) => setVoiceTone(e.target.value as VoiceTone | '')}>
                <option value="">Selecione um tom de voz</option>
                {VOICE_TONE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} — {opt.description}
                  </option>
                ))}
              </Select>
            </CardContent>
          </Card>

          {/* SEÇÃO 4 - WhatsApp */}

          <Card>
            <CardHeader>
              <CardTitle>Conversas WhatsApp</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-text-secondary mb-4">
                Número usado na página de destino das campanhas de Conversas WhatsApp.
              </p>
              <div>
                <label className="block text-sm font-semibold text-text-primary mb-2">Número do WhatsApp</label>
                <input
                  type="tel"
                  placeholder="(11) 99999-9999"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(fmtPhone(e.target.value))}
                  className="w-full rounded-lg border border-border bg-background text-foreground px-3 py-2 text-sm transition-colors outline-none focus:outline-none focus:ring-2 focus:ring-admin-petrol/30 focus:border-admin-petrol"
                />
                {!phoneValid && digitsOnly.length > 0 && (
                  <p className="text-xs text-red-500 mt-1">Número incompleto. Informe com DDD + 8 ou 9 dígitos.</p>
                )}
                <p className="text-xs text-text-secondary mt-1">Formato: (DD) XXXXX-XXXX. O sistema salva apenas os números.</p>
              </div>
            </CardContent>
          </Card>

          {/* ponytail: Biblioteca de Fotos oculta — reactivar quando Estúdio precisar de upload dedicado */}
          {false && (
            <Card>
              <CardHeader>
                <CardTitle>Biblioteca de Fotos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-text-secondary">
                    Fotos do produto disponíveis para uso no Estúdio Criativo.
                  </p>
                  <span className="text-sm font-semibold text-text-secondary">
                    {photoUrls.length}/{MAX_PHOTOS} fotos
                  </span>
                </div>

                <input
                  ref={photosInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  multiple
                  className="hidden"
                  onChange={handlePhotosSelect}
                />

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {photoUrls.map((url) => (
                    <div key={url} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200">
                      <img src={url} alt="Foto da biblioteca" className="w-full h-full object-cover" />
                      <button
                        onClick={() => handleDeletePhoto(url)}
                        disabled={deletePhoto.isPending}
                        className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {photoUrls.length < MAX_PHOTOS && (
                    <div
                      onClick={() => photosInputRef.current?.click()}
                      className="aspect-square flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-[#E8631A]/50 hover:bg-orange-50/40 transition-colors"
                    >
                      {uploadPhotos.isPending ? (
                        <p className="text-xs text-text-secondary text-center px-2">Enviando...</p>
                      ) : (
                        <>
                          <ImageIcon className="w-5 h-5 text-gray-400" />
                          <p className="text-xs text-text-secondary text-center px-2">Adicionar fotos</p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Save button */}
      <div className="flex justify-start pt-4 border-t border-border">
        <Button variant="primary" size="md" onClick={handleSave} disabled={saveBrandKit.isPending}>
          {saveBrandKit.isPending ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </div>
  );
}
