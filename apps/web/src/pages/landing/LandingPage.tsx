import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FURY_COLORS } from '@/lib/constants';

const API_BASE = 'https://clickhero-fury-api.u7pe19.easypanel.host/api';

interface PublicBrandKitData {
  tenantName: string;
  logo_url: string | null;
  whatsapp_number: string | null;
  primary_color: string;
  secondary_color: string;
}

export function LandingPage() {
  const { codigo } = useParams<{ codigo: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery<PublicBrandKitData>({
    queryKey: ['public-brand-kit', codigo],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/public/brand-kit/${codigo}`);
      if (!res.ok) throw new Error('Tenant não encontrado');
      const json = await res.json();
      return json.data;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5]">
        <div className="w-10 h-10 border-4 border-[#E8631A]/30 border-t-[#E8631A] rounded-full animate-spin" />
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] p-6">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Página não encontrada</h1>
          <p className="text-gray-500 mb-6">
            O link que você acessou não existe ou foi desativado.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-[#E8631A] text-white rounded-full font-semibold hover:opacity-90 transition-opacity"
          >
            Ir para o início
          </button>
        </div>
      </div>
    );
  }

  const { tenantName, logo_url, whatsapp_number, primary_color, secondary_color } = data;
  const bgColor = secondary_color || '#f5f5f5';
  const accentColor = primary_color || FURY_COLORS.primary;

  function handleWhatsAppClick() {
    if (whatsapp_number) {
      const clean = whatsapp_number.replace(/\D/g, '');
      window.open(`https://wa.me/${clean}`, '_blank', 'noopener');
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ backgroundColor: bgColor }}
    >
      <div className="text-center max-w-sm w-full">
        {/* Logo - rounded like WhatsApp profile pic */}
        {logo_url ? (
          <div className="w-28 h-28 mx-auto mb-5 overflow-hidden rounded-full border-4 border-white shadow-lg">
            <img
              src={logo_url}
              alt={`Logo ${tenantName}`}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="w-28 h-28 mx-auto mb-5 rounded-full bg-white/80 border-4 border-white shadow-lg flex items-center justify-center">
            <span className="text-4xl font-bold" style={{ color: accentColor }}>
              {(tenantName || '?').charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Company name */}
        <h1 className="text-2xl font-bold mb-8" style={{ color: accentColor }}>
          {tenantName}
        </h1>

        {/* WhatsApp button */}
        {whatsapp_number ? (
          <button
            onClick={handleWhatsAppClick}
            className="inline-flex items-center justify-center gap-3 w-full px-8 py-4 rounded-full text-lg font-bold text-white shadow-lg hover:opacity-90 active:opacity-80 transition-all duration-200 cursor-pointer"
            style={{ backgroundColor: '#25D366' }}
          >
            <svg
              viewBox="0 0 24 24"
              className="w-6 h-6 fill-current flex-shrink-0"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Clique aqui para falar no WhatsApp
          </button>
        ) : (
          <p className="text-sm text-gray-500">
            WhatsApp não configurado
          </p>
        )}
      </div>
    </div>
  );
}
