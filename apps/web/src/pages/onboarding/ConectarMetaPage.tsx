import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function ConectarMetaPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isConnected = searchParams.get('connected') === 'true';

  const handleConnectMeta = () => {
    navigate('/onboarding/meta-authorize');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#F6F8FA] to-white flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-2xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left Side - Branding */}
          <div className="hidden lg:flex flex-col justify-center space-y-8">
            <div className="space-y-4">
              <h1 className="text-5xl font-black text-[#1C1C1E] leading-tight">
                {isConnected ? 'Tudo Pronto!' : 'Conecte Meta'}
              </h1>
              <p className="text-xl text-[#6E7681] font-semibold leading-relaxed">
                {isConnected
                  ? 'Sua conta Meta está conectada e você pode começar a gerenciar campanhas.'
                  : 'Integre com Meta Ads para gerenciar todas as suas campanhas de forma automatizada.'}
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex gap-4 items-start">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[#E8631A] text-white">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
                <div>
                  <h3 className="font-bold text-[#1C1C1E]">Gerenciamento Centralizado</h3>
                  <p className="text-sm text-[#6E7681] mt-1">Todas as campanhas em um único dashboard</p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[#E8631A] text-white">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
                <div>
                  <h3 className="font-bold text-[#1C1C1E]">Análise em Tempo Real</h3>
                  <p className="text-sm text-[#6E7681] mt-1">Dados atualizados constantemente</p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[#E8631A] text-white">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
                <div>
                  <h3 className="font-bold text-[#1C1C1E]">Otimização Automática</h3>
                  <p className="text-sm text-[#6E7681] mt-1">IA ajusta campanhas para máximo ROAS</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side - Card */}
          <div>
            {isConnected ? (
              <div className="bg-white rounded-3xl border border-[#E0E0E0] shadow-2xl p-8 space-y-8">
                {/* Success Icon */}
                <div className="flex justify-center">
                  <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-[#2EA043]/10 border-2 border-[#2EA043]">
                    <svg className="w-12 h-12 text-[#2EA043]" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>

                {/* Content */}
                <div className="text-center space-y-3">
                  <h2 className="text-3xl font-black text-[#1C1C1E]">Conectado!</h2>
                  <p className="text-[#6E7681] leading-relaxed">
                    Sua conta Meta foi integrada com sucesso. Você pode começar a gerenciar suas campanhas agora.
                  </p>
                </div>

                {/* Button */}
                <Button
                  onClick={() => navigate('/dashboard')}
                  variant="primary"
                  size="md"
                  className="w-full"
                >
                  Acessar Dashboard
                </Button>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-[#E0E0E0] shadow-2xl p-8 space-y-8">
                {/* Header */}
                <div className="space-y-3">
                  <h2 className="text-3xl font-black text-[#1C1C1E]">Conectar Meta</h2>
                  <p className="text-[#6E7681] leading-relaxed">
                    Autorize FURY para acessar suas campanhas de anúncios
                  </p>
                </div>

                {/* Info Box */}
                <div className="bg-[#E8631A]/8 border border-[#E8631A]/30 rounded-2xl p-5 flex gap-4">
                  <div className="flex-shrink-0">
                    <svg className="w-6 h-6 text-[#E8631A] mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M13 7H7v6h6V7z" />
                      <path fillRule="evenodd" d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h2V2a1 1 0 112 0v1h1a2 2 0 012 2v2h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v2h1a2 2 0 01-2 2h-1v1a1 1 0 11-2 0v-1h-2v1a1 1 0 11-2 0v-1H7a2 2 0 01-2-2v-1H4a1 1 0 110-2h1V9H4a1 1 0 010-2h1V5H4a1 1 0 010-2h1V2H7z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <p className="text-sm text-[#1C1C1E] font-semibold">
                    Você será redirecionado para autorizar a conexão com segurança
                  </p>
                </div>

                {/* Button */}
                <Button
                  onClick={handleConnectMeta}
                  variant="primary"
                  size="md"
                  className="w-full"
                >
                  Conectar Conta Meta
                </Button>

                {/* Footer Text */}
                <div className="space-y-3 border-t border-[#E0E0E0] pt-6">
                  <p className="text-xs text-[#6E7681] text-center uppercase tracking-widest font-bold">
                    Segurança Garantida
                  </p>
                  <p className="text-xs text-[#6E7681] text-center leading-relaxed">
                    Respeitamos sua privacidade. Você controla quais permissões liberar e pode revogar a qualquer momento.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
