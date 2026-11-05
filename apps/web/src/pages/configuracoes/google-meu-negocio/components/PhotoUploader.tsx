import { useState, useRef } from 'react';
import { Upload, X, Loader2, ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

const SURFACE = 'rounded-2xl border border-border bg-surface p-6 shadow-sm';
const BUTTON_HOVER = 'transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]';

interface PhotoUploaderProps {
  profileId: string;
  photos: string[];
  onPhotosChange?: (photos: string[]) => void;
}

interface GoogleApiResponse<T> {
  success: boolean;
  data: T;
}

export function PhotoUploader({ profileId, photos, onPhotosChange }: PhotoUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Apenas imagens sao permitidas.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('A imagem deve ter no maximo 10MB.');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('photo', file);

      const response = await api.post<GoogleApiResponse<{ photos: string[] }>>(
        `/google/profiles/${profileId}/photos`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      onPhotosChange?.(response.data.data.photos);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setError(axiosErr.response?.data?.error?.message ?? 'Falha ao enviar imagem.');
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove(photoUrl: string) {
    setRemoving(photoUrl);
    setError(null);

    try {
      const response = await api.delete<GoogleApiResponse<{ photos: string[] }>>(
        `/google/profiles/${profileId}/photos`,
        { params: { url: photoUrl } }
      );

      onPhotosChange?.(response.data.data.photos);
    } catch (err) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setError(axiosErr.response?.data?.error?.message ?? 'Falha ao remover imagem.');
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className={`${SURFACE} space-y-4`}>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-text-primary">Fotos do negocio</h3>
        <span className="text-xs text-text-tertiary">
          {photos.length} foto{photos.length !== 1 ? 's' : ''}
        </span>
      </div>

      <p className="text-xs text-text-tertiary">
        As fotos sao armazenadas localmente na Ady e <span className="font-semibold text-warning">NÃO</span> publicadas automaticamente no Google.
      </p>

      {error && (
        <div className="rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-xs text-error">
          {error}
        </div>
      )}

      {photos.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((photo) => (
            <div key={photo} className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-surface-secondary">
              <img
                src={photo}
                alt="Foto do negocio"
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <button
                type="button"
                onClick={() => handleRemove(photo)}
                disabled={removing === photo}
                className={cn(
                  'absolute top-2 right-2 rounded-full bg-error/90 p-1 text-white opacity-0 transition group-hover:opacity-100 cursor-pointer',
                  removing === photo && 'opacity-100'
                )}
              >
                {removing === photo ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface-secondary py-12">
          <ImageOff className="mb-2 h-8 w-8 text-text-tertiary" />
          <p className="text-xs text-text-tertiary">Nenhuma foto adicionada ainda.</p>
        </div>
      )}

      <div className="flex justify-end">
        <label
          className={cn(
            'inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2 text-xs font-semibold text-white cursor-pointer',
            BUTTON_HOVER,
            uploading && 'opacity-50 cursor-not-allowed'
          )}
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {uploading ? 'Enviando...' : 'Enviar foto'}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>
    </div>
  );
}
