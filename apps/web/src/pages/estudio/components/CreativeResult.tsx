import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, BookmarkCheck, Loader2, RefreshCw, Upload } from 'lucide-react';
import { Button } from '@/components';
import api from '@/lib/api';
import type { GenerateCreativeResponse, StudioPublishResponse } from '@/types/studio';

const CTA_OPTIONS = [
  'Saiba Mais',
  'Compre Agora',
  'Fale Conosco',
  'Garanta o Seu',
  'Acesse Agora',
  'Clique Aqui',
  'Quero Conhecer',
  'Baixe Grátis',
];

interface Props {
  result: GenerateCreativeResponse;
  onBack: () => void;
  onNewCreative: () => void;
}

export function CreativeResult({ result, onBack, onNewCreative }: Props) {
  const queryClient = useQueryClient();
  const [headline, setHeadline] = useState(result.creativeData.headline ?? '');
  const [primaryText, setPrimaryText] = useState(result.creativeData.primary_text ?? '');
  const [cta, setCta] = useState(result.creativeData.cta ?? CTA_OPTIONS[0]);
  const [subheadline, setSubheadline] = useState(result.creativeData.subheadline ?? '');
  const [showRegenerateForm, setShowRegenerateForm] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [publishFeedback, setPublishFeedback] = useState<StudioPublishResponse | null>(null);
  const [currentResult, setCurrentResult] = useState(result);

  const regenerateMutation = useMutation({
    mutationFn: async ({ assetId, feedbackText }: { assetId: string; feedbackText: string }) => {
      const res = await api.post<GenerateCreativeResponse>('/studio/creative/regenerate', {
        assetId,
        feedback: feedbackText,
      });
      return res.data;
    },
    onSuccess: (data) => {
      setCurrentResult(data);
      setHeadline(data.creativeData.headline ?? '');
      setPrimaryText(data.creativeData.primary_text ?? '');
      setCta(data.creativeData.cta ?? CTA_OPTIONS[0]);
      setSubheadline(data.creativeData.subheadline ?? '');
      setShowRegenerateForm(false);
      setFeedback('');
      setPublishFeedback(null);
      void queryClient.invalidateQueries({ queryKey: ['studio/assets'] });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (assetId: string) => {
      const res = await api.post<StudioPublishResponse>(`/studio/publish/${assetId}`, {});
      return res.data;
    },
    onSuccess: (data) => {
      setPublishFeedback(data);
    },
  });

  const handleSaveToLibrary = () => {
    void queryClient.invalidateQueries({ queryKey: ['studio/assets'] });
    onBack();
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
        {/* Image preview */}
        <div className="overflow-hidden rounded-2xl border border-[#E6E8EC] bg-gray-100">
          <div className="relative aspect-square">
            <img
              src={currentResult.imageUrl}
              alt="Criativo gerado"
              className="h-full w-full object-cover"
              onError={(e) => {
                console.error('=== Image failed to load:', currentResult.imageUrl);
                (e.target as HTMLImageElement).style.display = 'none';
              }}
              onLoad={() => console.log('=== Rendering image:', currentResult.imageUrl)}
            />
          </div>
        </div>

        {/* Text panel */}
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E8631A]">Textos gerados</p>
            <p className="text-sm text-[#667085]">Edite os textos antes de publicar</p>
          </div>

          <div className="space-y-3">
            <Field label="Headline">
              <input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                className="w-full rounded-xl border border-[#E6E8EC] bg-[#FCFCFD] px-3 py-2.5 text-sm text-[#101828] outline-none transition focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/10"
              />
            </Field>

            <Field label="Subheadline">
              <input
                value={subheadline}
                onChange={(e) => setSubheadline(e.target.value)}
                className="w-full rounded-xl border border-[#E6E8EC] bg-[#FCFCFD] px-3 py-2.5 text-sm text-[#101828] outline-none transition focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/10"
              />
            </Field>

            <Field label="Texto Primário">
              <textarea
                value={primaryText}
                onChange={(e) => setPrimaryText(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-[#E6E8EC] bg-[#FCFCFD] px-3 py-2.5 text-sm text-[#101828] outline-none transition focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/10 resize-none"
              />
            </Field>

            <Field label="CTA">
              <select
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                className="w-full rounded-xl border border-[#E6E8EC] bg-[#FCFCFD] px-3 py-2.5 text-sm text-[#101828] outline-none transition focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/10"
              >
                {CTA_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Regenerate form */}
          {showRegenerateForm && (
            <div className="space-y-2 rounded-xl border border-[#E6E8EC] bg-[#FCFCFD] p-4">
              <p className="text-sm font-semibold text-[#101828]">O que você quer mudar?</p>
              <textarea
                autoFocus
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Ex: Deixe o headline mais urgente, use cores mais vibrantes, foque no preço..."
                rows={3}
                className="w-full rounded-xl border border-[#E6E8EC] bg-white px-3 py-2 text-sm text-[#101828] outline-none transition focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/10 resize-none"
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => regenerateMutation.mutate({ assetId: currentResult.assetId, feedbackText: feedback })}
                  disabled={feedback.trim().length < 3 || regenerateMutation.isPending}
                  className="flex-1 bg-[#E8631A] hover:bg-[#D45714] text-sm"
                >
                  {regenerateMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                  Regenerar
                </Button>
                <Button variant="outline" onClick={() => setShowRegenerateForm(false)} className="text-sm">
                  Cancelar
                </Button>
              </div>
              {regenerateMutation.isError && (
                <div className="flex items-center gap-2 text-xs text-red-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Erro ao regenerar. Tente novamente.
                </div>
              )}
            </div>
          )}

          {publishFeedback && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 space-y-1">
              <p className="font-semibold">Publicado no Meta!</p>
              <p className="text-xs">Hash: {publishFeedback.hash}</p>
              <a
                href={publishFeedback.adsManagerUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold underline"
              >
                Abrir no Ads Manager →
              </a>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-1">
            {!showRegenerateForm && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRegenerateForm(true)}
                disabled={regenerateMutation.isPending}
                className="w-full flex items-center justify-center gap-2"
              >
                <RefreshCw className="h-4 w-4 shrink-0" />
                Regenerar com ajuste
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveToLibrary}
              className="w-full flex items-center justify-center gap-2"
            >
              <BookmarkCheck className="h-4 w-4 shrink-0" />
              Salvar na Biblioteca
            </Button>

            <Button
              size="sm"
              onClick={() => publishMutation.mutate(currentResult.assetId)}
              disabled={publishMutation.isPending || !!publishFeedback}
              className="w-full flex items-center justify-center gap-2 bg-[#E8631A] hover:bg-[#D45714] text-white"
            >
              {publishMutation.isPending ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 shrink-0" />
              )}
              Publicar no Meta
            </Button>

            {publishMutation.isError && (
              <div className="flex items-center gap-2 text-xs text-red-600">
                <AlertCircle className="h-3.5 w-3.5" />
                Erro ao publicar. Verifique a conexão com o Meta.
              </div>
            )}

            <button
              onClick={onNewCreative}
              className="text-center text-xs text-[#667085] hover:text-[#E8631A] transition-colors pt-1"
            >
              Criar outro criativo →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-[#667085] uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}
