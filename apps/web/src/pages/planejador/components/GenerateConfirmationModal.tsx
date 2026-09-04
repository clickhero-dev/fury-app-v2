import { useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";

interface GenerateConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (postsCount: number) => void;
  creativesRemaining: number | null;
  creativesLimit: number | null;
  defaultPostsToGenerate: number;
}

export function GenerateConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  creativesRemaining,
  creativesLimit,
  defaultPostsToGenerate = 8,
}: GenerateConfirmationModalProps) {
  const [postsCount, setPostsCount] = useState(defaultPostsToGenerate);
  
  if (!isOpen) return null;

  // Calculate max posts based on quota
  const maxPosts = creativesRemaining !== null ? creativesRemaining : 100; // Cap at 100 for unlimited
  const quotaSufficient = creativesRemaining === null || creativesRemaining >= postsCount;
  const quotaText = creativesRemaining !== null && creativesLimit !== null
    ? `${creativesRemaining} de ${creativesLimit}`
    : creativesRemaining !== null
    ? `${creativesRemaining}`
    : 'Ilimitado';

  const handlePostsCountChange = (value: number) => {
    const clampedValue = Math.max(1, Math.min(value, maxPosts));
    setPostsCount(clampedValue);
  };

  const handleConfirm = () => {
    onConfirm(postsCount);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-surface border border-border shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">
            Confirmar geração de planejamento
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-tertiary transition-colors hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Quota Info */}
          <div className={`flex items-start gap-3 rounded-xl p-4 ${
            quotaSufficient
              ? 'bg-success/10 border border-success/20'
              : 'bg-warning/10 border border-warning/20'
          }`}>
            {quotaSufficient ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-success mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 shrink-0 text-warning mt-0.5" />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary">
                Cota de criativos
              </p>
              <p className="text-sm text-text-secondary mt-1">
                Você tem <span className="font-semibold text-text-primary">{quotaText}</span> criativo{creativesRemaining !== 1 ? 's' : ''} restante{creativesRemaining !== 1 ? 's' : ''} este mês.
              </p>
            </div>
          </div>

          {/* Generation Info */}
          <div className="rounded-xl bg-surface-muted border border-border p-4">
            <p className="text-sm font-medium text-text-primary">
              Quantidade de posts a gerar
            </p>
            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={() => handlePostsCountChange(postsCount - 1)}
                disabled={postsCount <= 1}
                className="w-8 h-8 rounded-lg bg-surface border border-border flex items-center justify-center text-text-primary hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                -
              </button>
              <input
                type="number"
                min="1"
                max={maxPosts}
                value={postsCount}
                onChange={(e) => handlePostsCountChange(parseInt(e.target.value) || 1)}
                className="w-20 text-center text-2xl font-bold text-text-primary bg-transparent border-0 focus:outline-none focus:ring-0"
              />
              <button
                type="button"
                onClick={() => handlePostsCountChange(postsCount + 1)}
                disabled={postsCount >= maxPosts}
                className="w-8 h-8 rounded-lg bg-surface border border-border flex items-center justify-center text-text-primary hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                +
              </button>
            </div>
            <p className="text-xs text-text-tertiary mt-2">
              {postsCount} imagens • 1 cota por imagem • Máximo: {maxPosts}
            </p>
          </div>

          {/* Warning if insufficient quota */}
          {!quotaSufficient && (
            <div className="flex items-start gap-2 rounded-lg bg-warning/5 border border-warning/20 p-3">
              <AlertCircle className="h-4 w-4 shrink-0 text-warning mt-0.5" />
              <p className="text-xs text-text-secondary">
                Cota insuficiente para gerar {postsCount} posts. Você precisa de pelo menos {postsCount} criativos restantes.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!quotaSufficient}
            className="px-4 py-2 text-sm font-semibold text-white bg-brand rounded-lg transition-colors hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirmar e gerar
          </button>
        </div>
      </div>
    </div>
  );
}