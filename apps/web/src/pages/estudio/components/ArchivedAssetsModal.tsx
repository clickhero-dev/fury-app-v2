import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import api from '@/lib/api';
import type { StudioAsset } from '@/types/studio';
import { AssetCard } from '../EstudioHome';
import { useContentAreaCenterOffset } from '@/hooks/useContentAreaCenterOffset';

const PAGE_SIZE = 12;

interface StudioAssetResponse {
  assets: StudioAsset[];
  total: number;
  page: number;
  totalPages: number;
  creativesRemaining: number | null;
  creativesLimit: number | null;
}

interface Props {
  onClose: () => void;
  onViewDetails: (asset: StudioAsset) => void;
}

/**
 * Modal de criativos arquivados — cards só aparecem aqui (nunca na
 * biblioteca principal). "Ver detalhes" normal, sem excluir, com
 * "Restaurar anúncio" no lugar de "Usar em campanha". Paginado no servidor.
 */
export function ArchivedAssetsModal({ onClose, onViewDetails }: Props) {
  const queryClient = useQueryClient();
  const centerOffset = useContentAreaCenterOffset();
  const [page, setPage] = useState(1);

  const { data, isLoading, isPlaceholderData } = useQuery<StudioAssetResponse>({
    queryKey: ['studio/assets', 'archived', page],
    queryFn: async () => {
      const res = await api.get('/studio/assets', { params: { archived: 'true', page, limit: PAGE_SIZE } });
      return res.data;
    },
    placeholderData: (previous) => previous,
  });

  const restoreMutation = useMutation({
    mutationFn: async (assetId: string) => {
      await api.post(`/studio/assets/${assetId}/restore`);
    },
    onSuccess: () => {
      // Prefix match — invalida tanto esta lista (['studio/assets','archived',...])
      // quanto a biblioteca principal (['studio/assets']).
      void queryClient.invalidateQueries({ queryKey: ['studio/assets'] });
    },
  });

  const assets = data?.assets ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-w-6xl max-h-[85vh] overflow-y-auto"
        style={{ left: `calc(50% + ${centerOffset}px)` }}
      >
        <DialogHeader className="text-left">
          <DialogTitle className="text-xl">Arquivados</DialogTitle>
          <DialogDescription className="text-base">
            Criativos arquivados, com todo o histórico preservado — restaure quando quiser voltar a usá-los.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" />
          </div>
        ) : assets.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-tertiary">Nenhum criativo arquivado.</p>
        ) : (
          <div className={`space-y-4 transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {assets.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  archived
                  onViewDetails={() => onViewDetails(asset)}
                  onRestore={() => restoreMutation.mutate(asset.id)}
                  restorePending={restoreMutation.isPending && restoreMutation.variables === asset.id}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-1 pt-2 text-xs text-text-secondary">
                <span>
                  Exibindo {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => p - 1)}
                    disabled={page === 1}
                    className="border border-border bg-surface rounded-full px-3.5 py-1.5 text-xs text-text-primary hover:bg-surface-secondary hover:border-text-tertiary/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    ‹ Anterior
                  </button>
                  <span className="font-semibold text-text-primary px-1">{page} / {totalPages}</span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page === totalPages}
                    className="border border-border bg-surface rounded-full px-3.5 py-1.5 text-xs text-text-primary hover:bg-surface-secondary hover:border-text-tertiary/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    Próxima ›
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
