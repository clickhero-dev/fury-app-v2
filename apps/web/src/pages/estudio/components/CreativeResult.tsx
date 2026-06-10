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

interface EditedTexts {
  headline: string;
  subheadline: string;
  primary_text: string;
}

interface Props {
  result: GenerateCreativeResponse;
  hasProductImage?: boolean;
  onBack: () => void;
  onNewCreative: () => void;
}

export function CreativeResult({ result, hasProductImage = false, onBack, onNewCreative }: Props) {
  const queryClient = useQueryClient();
  const [currentResult, setCurrentResult] = useState(result);
  const [editedTexts, setEditedTexts] = useState<EditedTexts>({
    headline: result.creativeData.headline ?? '',
    subheadline: result.creativeData.subheadline ?? '',
    primary_text: result.creativeData.primary_text ?? '',
  });
  const [cta, setCta] = useState(result.creativeData.cta ?? CTA_OPTIONS[0]);
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState(false);
  const [showRegenerateForm, setShowRegenerateForm] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [publishFeedback, setPublishFeedback] = useState<StudioPublishResponse | null>(null);

  const syncResult = (data: GenerateCreativeResponse) => {
    setCurrentResult(data);
    setEditedTexts({
      headline: data.creativeData.headline ?? '',
      subheadline: data.creativeData.subheadline ?? '',
      primary_text: data.creativeData.primary_text ?? '',
    });
    setCta(data.creativeData.cta ?? CTA_OPTIONS[0]);
    setPublishFeedback(null);
    void queryClient.invalidateQueries({ queryKey: ['studio/assets'] });
  };

  const regenerateMutation = useMutation({
    mutationFn: async ({ assetId, feedbackText }: { assetId: string; feedbackText: string }) => {
      const res = await api.post<GenerateCreativeResponse>('/studio/creative/regenerate', {
        assetId,
        feedback: feedbackText,
      });
      return res.data;
    },
    onSuccess: (data) => {
      syncResult(data);
      setShowRegenerateForm(false);
      setFeedback('');
    },
  });

  const editConfirmMutation = useMutation({
    mutationFn: async (assetId: string) => {
      const feedbackText = `Mantenha o estilo visual e as cores, mas use EXATAMENTE estes textos sem modificar as palavras: Headline: "${editedTexts.headline}". Subheadline: "${editedTexts.subheadline}". Texto principal: "${editedTexts.primary_text}".`;
      const res = await api.post<GenerateCreativeResponse>('/studio/creative/regenerate', {
        assetId,
        feedback: feedbackText,
      });
      return res.data;
    },
    onSuccess: (data) => {
      syncResult(data);
      setIsEditing(false);
      setEditError(false);
    },
    onError: () => {
      setEditError(true);
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

  const handleConfirmEdit = () => {
    setEditError(false);
    editConfirmMutation.mutate(currentResult.assetId);
  };

  const headlineTop = hasProductImage ? '54%' : '22%';
  const subheadlineTop = hasProductImage ? '71%' : '42%';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">

        {/* Image with edit overlay */}
        <div className="overflow-hidden rounded-2xl border border-[#E6E8EC]">
          <div style={{ position: 'relative', width: '100%', aspectRatio: '1/1' }}>
            <img
              src={currentResult.imageUrl}
              alt="Criativo gerado"
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                display: 'block', borderRadius: '8px',
                opacity: editConfirmMutation.isPending ? 0.5 : 1,
                transition: 'opacity 0.2s',
              }}
              onError={(e) => {
                console.error('=== Image failed to load:', currentResult.imageUrl);
                (e.target as HTMLImageElement).style.display = 'none';
              }}
              onLoad={() => console.log('=== Rendering image:', currentResult.imageUrl)}
            />

            {/* Loading overlay while confirming edit */}
            {editConfirmMutation.isPending && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '8px',
              }}>
                <div style={{
                  background: 'rgba(0,0,0,0.6)', borderRadius: '12px',
                  padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '10px',
                  color: 'white', fontSize: '14px',
                }}>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Aplicando edições...
                </div>
              </div>
            )}

            {/* Edit button — visible when not editing */}
            {!isEditing && !editConfirmMutation.isPending && (
              <button
                onClick={() => setIsEditing(true)}
                style={{
                  position: 'absolute', bottom: '12px', right: '12px',
                  background: 'rgba(0,0,0,0.65)', color: 'white',
                  border: 'none', borderRadius: '6px',
                  padding: '6px 14px', fontSize: '13px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                ✏️ Editar textos
              </button>
            )}

            {/* Edit overlay */}
            {isEditing && (
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '8px',
                background: 'rgba(0,0,0,0.35)',
              }}>
                {/* Headline textarea */}
                <textarea
                  value={editedTexts.headline}
                  onChange={(e) => setEditedTexts(prev => ({ ...prev, headline: e.target.value }))}
                  rows={2}
                  style={{
                    position: 'absolute',
                    top: headlineTop,
                    left: '50%', transform: 'translateX(-50%)',
                    width: '80%', textAlign: 'center',
                    fontSize: 'clamp(16px, 3.5vw, 28px)', fontWeight: 'bold',
                    color: 'white', cursor: 'text',
                    outline: 'none', resize: 'none',
                    border: '2px dashed rgba(255,255,255,0.7)',
                    padding: '4px 8px', borderRadius: '4px',
                    background: 'rgba(0,0,0,0.2)',
                    lineHeight: '1.3',
                    fontFamily: 'inherit',
                  }}
                />

                {/* Subheadline textarea */}
                <textarea
                  value={editedTexts.subheadline}
                  onChange={(e) => setEditedTexts(prev => ({ ...prev, subheadline: e.target.value }))}
                  rows={1}
                  style={{
                    position: 'absolute',
                    top: subheadlineTop,
                    left: '50%', transform: 'translateX(-50%)',
                    width: '80%', textAlign: 'center',
                    fontSize: 'clamp(12px, 2.2vw, 18px)', fontWeight: 'normal',
                    color: 'rgba(255,255,255,0.9)', cursor: 'text',
                    outline: 'none', resize: 'none',
                    border: '2px dashed rgba(255,255,255,0.5)',
                    padding: '4px 8px', borderRadius: '4px',
                    background: 'rgba(0,0,0,0.2)',
                    lineHeight: '1.3',
                    fontFamily: 'inherit',
                  }}
                />

                {/* Edit error */}
                {editError && (
                  <div style={{
                    position: 'absolute', bottom: '56px',
                    left: '50%', transform: 'translateX(-50%)',
                    background: 'rgba(220,38,38,0.85)', color: 'white',
                    borderRadius: '6px', padding: '4px 12px', fontSize: '12px',
                    whiteSpace: 'nowrap',
                  }}>
                    Erro ao aplicar edição. Tente novamente.
                  </div>
                )}

                {/* Edit action buttons */}
                <div style={{
                  position: 'absolute', bottom: '12px',
                  left: '50%', transform: 'translateX(-50%)',
                  display: 'flex', gap: '8px',
                }}>
                  <button
                    onClick={() => { setIsEditing(false); setEditError(false); }}
                    style={{
                      background: 'rgba(0,0,0,0.65)', color: 'white',
                      border: '1px solid rgba(255,255,255,0.3)',
                      borderRadius: '6px', padding: '6px 14px',
                      fontSize: '13px', cursor: 'pointer',
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirmEdit}
                    style={{
                      background: '#EA580C', color: 'white',
                      border: 'none', borderRadius: '6px',
                      padding: '6px 14px', fontSize: '13px',
                      cursor: 'pointer', fontWeight: '500',
                    }}
                  >
                    ✓ Confirmar edição
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Text panel */}
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E8631A]">Textos gerados</p>
            <p className="text-sm text-[#667085]">Edite os textos antes de publicar</p>
          </div>

          <div className="space-y-3">
            <Field label="Título do anúncio">
              <input
                value={editedTexts.headline}
                onChange={(e) => setEditedTexts(prev => ({ ...prev, headline: e.target.value }))}
                className="w-full rounded-xl border border-[#E6E8EC] bg-[#FCFCFD] px-3 py-2.5 text-sm text-[#101828] outline-none transition focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/10"
              />
            </Field>

            <Field label="Chamada de apoio">
              <input
                value={editedTexts.subheadline}
                onChange={(e) => setEditedTexts(prev => ({ ...prev, subheadline: e.target.value }))}
                className="w-full rounded-xl border border-[#E6E8EC] bg-[#FCFCFD] px-3 py-2.5 text-sm text-[#101828] outline-none transition focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/10"
              />
            </Field>

            <Field label="Descrição">
              <textarea
                value={editedTexts.primary_text}
                onChange={(e) => setEditedTexts(prev => ({ ...prev, primary_text: e.target.value }))}
                rows={4}
                className="w-full rounded-xl border border-[#E6E8EC] bg-[#FCFCFD] px-3 py-2.5 text-sm text-[#101828] outline-none transition focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/10 resize-none"
              />
            </Field>

            <Field label="Botão de ação">
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
                  className="flex-1 flex items-center justify-center gap-2 bg-[#E8631A] hover:bg-[#D45714] text-white text-sm"
                >
                  {regenerateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Regenerar
                </Button>
                <Button variant="outline" onClick={() => setShowRegenerateForm(false)} className="flex items-center justify-center gap-2 text-sm">
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
