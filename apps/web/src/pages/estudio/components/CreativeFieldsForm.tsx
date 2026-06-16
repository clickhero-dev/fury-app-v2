import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, BookmarkCheck, Loader2, Plus, Trash2, Wand2, ImageOff } from 'lucide-react';
import { Button } from '@/components';
import api from '@/lib/api';
import { LAYOUT_META, type CreativeLayout, type LayoutFieldSpec } from '@/lib/layout-labels';
import type { CreativeCopyFields, PreviewCreativePayload, SuggestedFields } from '@/types/studio';

interface Props {
  layout: CreativeLayout;
  initial: SuggestedFields;
  imageUrl: string | null;
  submitting: boolean;
  onSubmit: (fields: CreativeCopyFields, mode: 'create' | 'library') => void;
  onBack: () => void;
}

const TEXT_KEYS = ['headline', 'subheadline', 'qualifier', 'offer_text', 'subtitle', 'subtitle_highlight', 'cta', 'price_text'] as const;
type TextKey = (typeof TEXT_KEYS)[number];

export function CreativeFieldsForm({ layout, initial, imageUrl, submitting, onSubmit, onBack }: Props) {
  const meta = LAYOUT_META[layout];

  const [texts, setTexts] = useState<Record<TextKey, string>>(() => {
    const seed = {} as Record<TextKey, string>;
    for (const k of TEXT_KEYS) seed[k] = (initial[k as keyof SuggestedFields] as string) ?? '';
    return seed;
  });
  const [benefits, setBenefits] = useState<string[]>(() =>
    initial.benefits && initial.benefits.length ? initial.benefits.slice(0, 4) : ['', '', ''],
  );
  const [tone, setTone] = useState<'institutional' | 'energetic'>(initial.tone ?? 'institutional');

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const lastUrlRef = useRef<string | null>(null);

  const buildCopy = useCallback((): CreativeCopyFields => {
    const cleanBenefits = benefits.map((b) => b.trim()).filter(Boolean);
    return {
      headline: texts.headline || undefined,
      subheadline: texts.subheadline || undefined,
      qualifier: texts.qualifier || undefined,
      offer_text: texts.offer_text || undefined,
      subtitle: texts.subtitle || undefined,
      subtitle_highlight: texts.subtitle_highlight || undefined,
      benefits: cleanBenefits.length ? cleanBenefits : undefined,
      cta: texts.cta || undefined,
      price_text: texts.price_text || undefined,
      tone: layout === 'split_horizontal_photo' ? tone : undefined,
    };
  }, [texts, benefits, tone, layout]);

  const missingImage = meta.needsImage && !imageUrl;

  // Preview fiel com debounce de 800ms (Estratégia A — mesmo PNG do backend).
  useEffect(() => {
    if (missingImage) {
      setPreviewError('Adicione uma foto na etapa anterior para ver o preview.');
      return;
    }
    setPreviewError(null);
    const payload: PreviewCreativePayload = {
      layout,
      ...buildCopy(),
      productImageUrl: imageUrl ?? undefined,
      includeLogo: true,
    };
    const handle = window.setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await api.post('/studio/preview-png', payload, { responseType: 'blob' });
        const url = URL.createObjectURL(res.data as Blob);
        if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
        lastUrlRef.current = url;
        setPreviewUrl(url);
        setPreviewError(null);
      } catch {
        setPreviewError('Não foi possível gerar o preview com esses dados.');
      } finally {
        setPreviewLoading(false);
      }
    }, 800);
    return () => window.clearTimeout(handle);
  }, [layout, imageUrl, missingImage, buildCopy]);

  useEffect(() => () => {
    if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
  }, []);

  const setText = (key: TextKey, value: string) => setTexts((t) => ({ ...t, [key]: value }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-6 items-start">
      {/* Live preview */}
      <div className="lg:sticky lg:top-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E8631A] mb-2">Preview ao vivo</p>
        <div className="relative aspect-square rounded-2xl border border-[#E6E8EC] bg-[#101828] overflow-hidden">
          {previewUrl && !previewError && (
            <img src={previewUrl} alt="Preview do criativo" className="w-full h-full object-cover" />
          )}
          {(previewLoading || (!previewUrl && !previewError)) && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <Loader2 className="h-7 w-7 animate-spin text-white/80" />
            </div>
          )}
          {previewError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6 text-[#98A2B3]">
              <ImageOff className="h-7 w-7" />
              <p className="text-sm">{previewError}</p>
            </div>
          )}
        </div>
        <p className="text-xs text-[#667085] mt-2 text-center">Este é exatamente o anúncio que será gerado.</p>
      </div>

      {/* Fields */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-[#101828]">{meta.label}</h2>
          <p className="text-sm text-[#667085] mt-1">Ajuste os textos. Sugerimos um ponto de partida — edite à vontade.</p>
        </div>

        <div className="space-y-3">
          {meta.fields.map((spec) => (
            <FieldInput
              key={spec.key}
              spec={spec}
              textValue={texts[spec.key as TextKey] ?? ''}
              onText={(v) => setText(spec.key as TextKey, v)}
              benefits={benefits}
              onBenefits={setBenefits}
              tone={tone}
              onTone={setTone}
            />
          ))}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button variant="outline" onClick={onBack} className="w-10 h-10 p-0 shrink-0" disabled={submitting}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() => onSubmit(buildCopy(), 'library')}
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <BookmarkCheck className="h-4 w-4" />
            Salvar na Biblioteca
          </Button>
          <Button
            onClick={() => onSubmit(buildCopy(), 'create')}
            disabled={submitting}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-[#EA580C] hover:bg-[#C2410C] text-white disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Criar meu anúncio
          </Button>
        </div>
      </div>
    </div>
  );
}

interface FieldInputProps {
  spec: LayoutFieldSpec;
  textValue: string;
  onText: (v: string) => void;
  benefits: string[];
  onBenefits: (b: string[]) => void;
  tone: 'institutional' | 'energetic';
  onTone: (t: 'institutional' | 'energetic') => void;
}

function FieldInput({ spec, textValue, onText, benefits, onBenefits, tone, onTone }: FieldInputProps) {
  const labelEl = (
    <div className="flex items-center justify-between">
      <label className="text-xs font-semibold text-[#667085] uppercase tracking-wide">
        {spec.label}
        {spec.optional && <span className="ml-1 normal-case font-normal text-[#98A2B3]">(opcional)</span>}
      </label>
      {spec.maxLength && (
        <span className={`text-[11px] ${textValue.length > spec.maxLength ? 'text-red-500' : 'text-[#98A2B3]'}`}>
          {textValue.length}/{spec.maxLength}
        </span>
      )}
    </div>
  );

  if (spec.kind === 'tone') {
    return (
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-[#667085] uppercase tracking-wide">{spec.label}</label>
        <div className="flex gap-2">
          {([['institutional', 'Sóbrio'], ['energetic', 'Energético']] as const).map(([val, lbl]) => (
            <button
              key={val}
              onClick={() => onTone(val)}
              className={`flex-1 rounded-xl border-2 py-2.5 text-sm font-semibold transition-all ${
                tone === val ? 'border-[#EA580C] bg-[#FFF4ED] text-[#EA580C]' : 'border-[#E6E8EC] text-[#667085] hover:border-[#F0B48E]'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (spec.kind === 'list') {
    const max = spec.maxItems ?? 4;
    return (
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-[#667085] uppercase tracking-wide">{spec.label}</label>
        <div className="space-y-2">
          {benefits.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={b}
                maxLength={spec.itemMaxLength}
                placeholder={spec.placeholder}
                onChange={(e) => onBenefits(benefits.map((x, j) => (j === i ? e.target.value : x)))}
                className="flex-1 rounded-xl border border-[#E6E8EC] bg-[#FCFCFD] px-3 py-2.5 text-sm text-[#101828] outline-none transition focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/10"
              />
              {benefits.length > 1 && (
                <button onClick={() => onBenefits(benefits.filter((_, j) => j !== i))} className="p-2 text-[#98A2B3] hover:text-red-500" title="Remover">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        {benefits.length < max && (
          <button onClick={() => onBenefits([...benefits, ''])} className="inline-flex items-center gap-1 text-xs font-semibold text-[#EA580C] hover:text-[#C2410C]">
            <Plus className="h-3.5 w-3.5" /> Adicionar benefício
          </button>
        )}
      </div>
    );
  }

  if (spec.kind === 'textarea') {
    return (
      <div className="space-y-1.5">
        {labelEl}
        <textarea
          value={textValue}
          maxLength={spec.maxLength}
          rows={3}
          placeholder={spec.placeholder}
          onChange={(e) => onText(e.target.value)}
          className="w-full rounded-xl border border-[#E6E8EC] bg-[#FCFCFD] px-3 py-2.5 text-sm text-[#101828] outline-none transition focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/10 resize-none"
        />
        {spec.hint && <p className="text-[11px] text-[#98A2B3]">{spec.hint}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {labelEl}
      <input
        value={textValue}
        maxLength={spec.maxLength}
        placeholder={spec.placeholder}
        onChange={(e) => onText(e.target.value)}
        className="w-full rounded-xl border border-[#E6E8EC] bg-[#FCFCFD] px-3 py-2.5 text-sm text-[#101828] outline-none transition focus:border-[#E8631A] focus:ring-2 focus:ring-[#E8631A]/10"
      />
      {spec.hint && <p className="text-[11px] text-[#98A2B3]">{spec.hint}</p>}
    </div>
  );
}
