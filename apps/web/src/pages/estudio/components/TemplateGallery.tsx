import type { StyleTemplate } from '@/types/studio';

const STYLE_TEMPLATES: StyleTemplate[] = [
  { id: 'product-focus', name: 'Meu Produto ou Serviço', category: 'Geral' },
  { id: 'irresistible-offer', name: 'Promoção Especial', category: 'Promoção' },
  { id: 'transformation', name: 'Antes e Depois', category: 'Resultado' },
  { id: 'social-proof', name: 'O que os clientes dizem', category: 'Confiança' },
  { id: 'minimal-premium', name: 'Simples e Elegante', category: 'Marca' },
  { id: 'bold-direct', name: 'Direto ao Ponto', category: 'Promoção' },
  { id: 'educational', name: 'Passo a Passo', category: 'Conteúdo' },
  { id: 'institutional', name: 'Minha Marca', category: 'Marca' },
];

const CATEGORY_COLORS: Record<string, string> = {
  Geral: 'bg-gray-100 text-gray-700',
  Promoção: 'bg-orange-100 text-orange-700',
  Resultado: 'bg-blue-100 text-blue-700',
  Confiança: 'bg-green-100 text-green-700',
  Marca: 'bg-purple-100 text-purple-700',
  Conteúdo: 'bg-teal-100 text-teal-700',
};

function TemplateSVG({ id }: { id: string }) {
  switch (id) {
    case 'product-focus':
      return (
        <svg viewBox="0 0 160 200" className="w-full h-full">
          <rect width="160" height="200" fill="#1a1a2e" />
          <circle cx="80" cy="90" r="45" fill="#2d2d4e" stroke="#E8631A" strokeWidth="2" />
          <circle cx="80" cy="90" r="28" fill="#3d3d5e" />
          <rect x="25" y="148" width="110" height="10" rx="5" fill="#E8631A" />
          <rect x="40" y="164" width="80" height="7" rx="3.5" fill="#ffffff40" />
          <rect x="55" y="177" width="50" height="7" rx="3.5" fill="#ffffff25" />
        </svg>
      );
    case 'irresistible-offer':
      return (
        <svg viewBox="0 0 160 200" className="w-full h-full">
          <rect width="160" height="200" fill="#FF3B30" />
          <circle cx="120" cy="40" r="30" fill="#FFD60A" />
          <text x="120" y="36" textAnchor="middle" fill="#1a1a1a" fontSize="13" fontWeight="bold">50%</text>
          <text x="120" y="49" textAnchor="middle" fill="#1a1a1a" fontSize="8">OFF</text>
          <rect x="20" y="70" width="120" height="14" rx="3" fill="#ffffff30" />
          <rect x="20" y="90" width="90" height="10" rx="3" fill="#ffffff20" />
          <rect x="20" y="106" width="100" height="10" rx="3" fill="#ffffff20" />
          <rect x="20" y="145" width="120" height="32" rx="8" fill="#FFD60A" />
          <text x="80" y="166" textAnchor="middle" fill="#1a1a1a" fontSize="11" fontWeight="bold">GARANTA AGORA</text>
          <rect x="20" y="184" width="60" height="6" rx="3" fill="#ffffff30" />
        </svg>
      );
    case 'transformation':
      return (
        <svg viewBox="0 0 160 200" className="w-full h-full">
          <rect width="160" height="200" fill="#f8fafc" />
          <rect x="0" y="0" width="75" height="200" fill="#f1f5f9" />
          <rect x="85" y="0" width="75" height="200" fill="#f0fdf4" />
          <rect x="20" y="25" width="40" height="8" rx="4" fill="#94a3b8" />
          <circle cx="45" cy="80" r="28" fill="#cbd5e1" />
          <rect x="100" y="25" width="40" height="8" rx="4" fill="#16a34a" />
          <circle cx="120" cy="80" r="28" fill="#86efac" />
          <polygon points="80,95 68,88 68,102" fill="#E8631A" />
          <polygon points="80,95 92,88 92,102" fill="#E8631A" />
          <rect x="20" y="122" width="40" height="6" rx="3" fill="#94a3b8" />
          <rect x="100" y="122" width="40" height="6" rx="3" fill="#16a34a" />
          <rect x="10" y="152" width="140" height="28" rx="6" fill="#E8631A" />
          <rect x="30" y="162" width="100" height="8" rx="4" fill="#fff" />
        </svg>
      );
    case 'social-proof':
      return (
        <svg viewBox="0 0 160 200" className="w-full h-full">
          <rect width="160" height="200" fill="#ffffff" stroke="#f0f0f0" strokeWidth="1" />
          <text x="20" y="52" fill="#E8631A" fontSize="52" fontFamily="Georgia,serif" opacity="0.2">"</text>
          <rect x="20" y="58" width="120" height="8" rx="4" fill="#e2e8f0" />
          <rect x="20" y="71" width="100" height="8" rx="4" fill="#e2e8f0" />
          <rect x="20" y="84" width="110" height="8" rx="4" fill="#e2e8f0" />
          <rect x="20" y="97" width="70" height="8" rx="4" fill="#e2e8f0" />
          <g transform="translate(20,115)">
            {[0, 20, 40, 60, 80].map((x) => (
              <polygon key={x} points={`${x + 8},0 ${x + 10},6 ${x + 16},6 ${x + 11},9 ${x + 13},16 ${x + 8},12 ${x + 3},16 ${x + 5},9 ${x},6 ${x + 6},6`} fill="#FFD60A" />
            ))}
          </g>
          <circle cx="32" cy="160" r="16" fill="#e2e8f0" />
          <rect x="54" y="152" width="70" height="7" rx="3.5" fill="#334155" />
          <rect x="54" y="163" width="50" height="6" rx="3" fill="#94a3b8" />
        </svg>
      );
    case 'minimal-premium':
      return (
        <svg viewBox="0 0 160 200" className="w-full h-full">
          <rect width="160" height="200" fill="#fafafa" />
          <rect x="60" y="30" width="40" height="2" fill="#E8631A" />
          <rect x="30" y="50" width="100" height="12" rx="2" fill="#1a1a1a" />
          <rect x="45" y="68" width="70" height="8" rx="2" fill="#1a1a1a" opacity="0.65" />
          <rect x="55" y="90" width="50" height="6" rx="2" fill="#94a3b8" />
          <rect x="60" y="102" width="40" height="6" rx="2" fill="#94a3b8" />
          <rect x="65" y="130" width="30" height="1" fill="#E8631A" />
          <rect x="50" y="145" width="60" height="28" rx="2" fill="none" stroke="#1a1a1a" strokeWidth="1.5" />
          <rect x="64" y="154" width="32" height="10" rx="1" fill="#1a1a1a" />
          <rect x="60" y="185" width="40" height="4" rx="2" fill="#e2e8f0" />
        </svg>
      );
    case 'bold-direct':
      return (
        <svg viewBox="0 0 160 200" className="w-full h-full">
          <rect width="160" height="200" fill="#0f0f0f" />
          <rect x="15" y="30" width="130" height="18" rx="2" fill="#ffffff" />
          <rect x="15" y="52" width="110" height="18" rx="2" fill="#ffffff" />
          <rect x="15" y="74" width="120" height="18" rx="2" fill="#E8631A" />
          <rect x="15" y="96" width="90" height="18" rx="2" fill="#E8631A" />
          <rect x="15" y="128" width="130" height="10" rx="2" fill="#ffffff40" />
          <rect x="15" y="143" width="100" height="10" rx="2" fill="#ffffff30" />
          <rect x="15" y="170" width="80" height="16" rx="4" fill="#E8631A" />
          <rect x="105" y="170" width="40" height="16" rx="4" fill="#ffffff15" />
        </svg>
      );
    case 'educational':
      return (
        <svg viewBox="0 0 160 200" className="w-full h-full">
          <rect width="160" height="200" fill="#f8fafc" />
          <rect x="15" y="15" width="130" height="12" rx="3" fill="#334155" />
          <rect x="15" y="32" width="80" height="8" rx="3" fill="#94a3b8" />
          <circle cx="28" cy="68" r="12" fill="#E8631A" />
          <text x="28" y="73" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="bold">1</text>
          <rect x="46" y="62" width="80" height="7" rx="3" fill="#334155" />
          <rect x="46" y="73" width="60" height="5" rx="2.5" fill="#94a3b8" />
          <line x1="28" y1="80" x2="28" y2="97" stroke="#E8631A" strokeWidth="1.5" strokeDasharray="3,2" opacity="0.4" />
          <circle cx="28" cy="109" r="12" fill="#E8631A" opacity="0.7" />
          <text x="28" y="114" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="bold">2</text>
          <rect x="46" y="103" width="80" height="7" rx="3" fill="#334155" />
          <rect x="46" y="114" width="60" height="5" rx="2.5" fill="#94a3b8" />
          <line x1="28" y1="121" x2="28" y2="138" stroke="#E8631A" strokeWidth="1.5" strokeDasharray="3,2" opacity="0.25" />
          <circle cx="28" cy="150" r="12" fill="#E8631A" opacity="0.4" />
          <text x="28" y="155" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="bold">3</text>
          <rect x="46" y="144" width="80" height="7" rx="3" fill="#334155" />
          <rect x="46" y="155" width="60" height="5" rx="2.5" fill="#94a3b8" />
        </svg>
      );
    case 'institutional':
      return (
        <svg viewBox="0 0 160 200" className="w-full h-full">
          <rect width="160" height="200" fill="#ffffff" />
          <rect x="0" y="0" width="160" height="5" fill="#E8631A" />
          <circle cx="80" cy="60" r="30" fill="#f1f5f9" stroke="#e2e8f0" strokeWidth="1.5" />
          <rect x="62" y="48" width="36" height="6" rx="2" fill="#334155" />
          <rect x="67" y="58" width="26" height="5" rx="2" fill="#94a3b8" />
          <rect x="70" y="67" width="20" height="4" rx="2" fill="#E8631A" />
          <rect x="30" y="107" width="100" height="10" rx="3" fill="#1e293b" />
          <rect x="40" y="122" width="80" height="7" rx="3" fill="#94a3b8" />
          <rect x="50" y="134" width="60" height="7" rx="3" fill="#94a3b8" />
          <rect x="20" y="157" width="120" height="1" fill="#e2e8f0" />
          <rect x="40" y="167" width="80" height="8" rx="2" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1" />
          <rect x="0" y="192" width="160" height="8" fill="#E8631A" />
        </svg>
      );
    default:
      return <rect width="160" height="200" fill="#f1f5f9" />;
  }
}

interface Props {
  selectedTemplate: StyleTemplate | null;
  onSelect: (template: StyleTemplate | null) => void;
}

export function TemplateGallery({ selectedTemplate, onSelect }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {STYLE_TEMPLATES.map((template) => {
        const isSelected = selectedTemplate?.id === template.id;
        return (
          <button
            key={template.id}
            onClick={() => onSelect(isSelected ? null : template)}
            className={`group rounded-xl border-2 overflow-hidden text-left transition-all focus:outline-none ${
              isSelected
                ? 'border-[#EA580C] shadow-[0_0_0_3px_rgba(234,88,12,0.12)]'
                : 'border-[#E6E8EC] hover:border-[#F0B48E]'
            }`}
          >
            <div className="aspect-[3/4] bg-[#f8fafc] overflow-hidden">
              <TemplateSVG id={template.id} />
            </div>
            <div className="px-2 py-1.5 bg-white">
              <p className="text-[11px] font-semibold text-[#101828] leading-tight">{template.name}</p>
              <span className={`inline-block mt-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${CATEGORY_COLORS[template.category]}`}>
                {template.category}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
