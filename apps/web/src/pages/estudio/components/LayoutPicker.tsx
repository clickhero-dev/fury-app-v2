import { CheckCircle2, Image as ImageIcon, BadgeCheck } from 'lucide-react';
import { Button } from '@/components';
import { CREATIVE_LAYOUTS, LAYOUT_META, FUNNEL_LABEL, type CreativeLayout } from '@/lib/layout-labels';

// Mini-preview ilustrativo de cada arquétipo (placeholder até o Prompt 6 gerar
// thumbnails reais dos samples).
function LayoutThumb({ layout }: { layout: CreativeLayout }) {
  const c = '#EA580C';
  switch (layout) {
    case 'editorial_headline':
      return (
        <svg viewBox="0 0 120 120" className="w-full h-full">
          <rect width="120" height="120" fill="#1c1917" />
          <rect width="120" height="64" fill="#57534e" />
          <rect x="10" y="78" width="4" height="30" fill={c} />
          <rect x="20" y="80" width="80" height="8" rx="2" fill="#fbbf24" />
          <rect x="20" y="92" width="64" height="8" rx="2" fill="#fbbf24" />
          <rect x="20" y="106" width="70" height="5" rx="2" fill="#ffffff80" />
        </svg>
      );
    case 'offer_burst':
      return (
        <svg viewBox="0 0 120 120" className="w-full h-full">
          <rect width="120" height="120" fill={c} />
          {Array.from({ length: 12 }).map((_, i) => (
            <line key={i} x1="60" y1="60" x2={60 + 90 * Math.cos((i / 12) * 6.28)} y2={60 + 90 * Math.sin((i / 12) * 6.28)} stroke="#ffffff20" strokeWidth="6" />
          ))}
          <rect x="22" y="44" width="76" height="32" rx="16" fill="#2b2b2b" />
          <text x="60" y="66" textAnchor="middle" fill="#fbbf24" fontSize="18" fontWeight="bold">50%</text>
        </svg>
      );
    case 'split_diagonal_product':
      return (
        <svg viewBox="0 0 120 120" className="w-full h-full">
          <polygon points="0,0 120,0 120,46 0,54" fill={c} />
          <polygon points="0,54 120,46 120,120 0,120" fill="#3a1207" />
          <rect x="64" y="22" width="40" height="64" rx="3" fill="#1f2937" />
          <rect x="12" y="74" width="44" height="5" rx="2" fill="#fff" />
          <rect x="12" y="84" width="40" height="5" rx="2" fill="#fff" />
          <rect x="64" y="96" width="44" height="14" rx="3" fill={c} />
        </svg>
      );
    case 'photo_immersive':
      return (
        <svg viewBox="0 0 120 120" className="w-full h-full">
          <rect width="120" height="120" fill="#57534e" />
          <rect y="70" width="120" height="50" fill="#00000088" />
          <rect x="10" y="10" width="22" height="22" rx="5" fill="#fff" />
          <rect x="12" y="84" width="60" height="6" rx="2" fill="#fff" />
          <rect x="12" y="94" width="44" height="9" rx="2" fill="#fff" />
          <rect x="12" y="108" width="40" height="9" rx="2" fill={c} />
        </svg>
      );
    case 'split_horizontal_photo':
      return (
        <svg viewBox="0 0 120 120" className="w-full h-full">
          <rect width="120" height="54" fill="#3d3d3d" />
          <rect y="54" width="120" height="66" fill="#57534e" />
          <rect x="12" y="14" width="60" height="7" rx="2" fill="#fff" />
          <rect x="12" y="26" width="44" height="6" rx="2" fill="#ffffffaa" />
          <rect x="12" y="38" width="36" height="10" rx="2" fill="#fff" />
          <rect x="12" y="44" width="20" height="20" rx="5" fill="#fff" />
        </svg>
      );
  }
}

interface Props {
  selected: CreativeLayout | null;
  onSelect: (layout: CreativeLayout) => void;
  onContinue: () => void;
  hasImage: boolean;
  hasLogo: boolean;
}

export function LayoutPicker({ selected, onSelect, onContinue, hasImage, hasLogo }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-[#101828]">Escolha o formato do seu anúncio</h2>
        <p className="text-sm text-[#667085] mt-1">Cada formato tem um objetivo. Veja qual combina com o que você quer comunicar.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CREATIVE_LAYOUTS.map((layout) => {
          const meta = LAYOUT_META[layout];
          const isSelected = selected === layout;
          const missingImage = meta.needsImage && !hasImage;
          const missingLogo = meta.needsLogo && !hasLogo;
          const blocked = missingImage || missingLogo;
          return (
            <button
              key={layout}
              onClick={() => !blocked && onSelect(layout)}
              disabled={blocked}
              className={`group text-left rounded-2xl border-2 p-3 transition-all ${
                isSelected
                  ? 'border-[#EA580C] shadow-[0_0_0_3px_rgba(234,88,12,0.12)]'
                  : blocked
                  ? 'border-[#E6E8EC] opacity-60 cursor-not-allowed'
                  : 'border-[#E6E8EC] hover:border-[#F0B48E]'
              }`}
            >
              <div className="flex gap-3">
                <div className="w-20 h-20 shrink-0 rounded-xl overflow-hidden border border-[#E6E8EC]">
                  <LayoutThumb layout={layout} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold text-[#101828] truncate">{meta.label}</p>
                    {isSelected && <CheckCircle2 className="h-4 w-4 text-[#EA580C] shrink-0" />}
                  </div>
                  <span className="inline-block mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#FFF4ED] text-[#B54708]">
                    {FUNNEL_LABEL[meta.funnelStage]}
                  </span>
                  <p className="text-xs text-[#667085] mt-1.5 line-clamp-2">{meta.whenToUse}</p>
                </div>
              </div>
              {blocked && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-[#B54708]">
                  {missingImage && <span className="inline-flex items-center gap-1"><ImageIcon className="h-3 w-3" /> Precisa de uma foto</span>}
                  {missingLogo && <span className="inline-flex items-center gap-1"><BadgeCheck className="h-3 w-3" /> Precisa de logo no Brand Kit</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <Button
        onClick={onContinue}
        disabled={!selected}
        className="w-full bg-[#EA580C] hover:bg-[#C2410C] text-white font-semibold disabled:opacity-50"
      >
        {selected ? `Continuar com ${LAYOUT_META[selected].label}` : 'Selecione um formato'}
      </Button>
    </div>
  );
}
