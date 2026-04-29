import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function ConectarMetaPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isConnected = searchParams.get('connected') === 'true';

  const handleConnectMeta = () => {
    navigate('/onboarding/meta-authorize');
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <div className="p-8 sm:p-10">
          {isConnected ? (
            <div className="text-center space-y-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-50 border-2 border-green-200">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-gray-900">
                  Conta Conectada!
                </h2>
                <p className="text-gray-600 text-sm">
                  Sua conta Meta foi conectada com sucesso e pronta para uso
                </p>
              </div>
              <Button
                onClick={() => navigate('/dashboard')}
                variant="primary"
                className="w-full text-white font-semibold"
                size="md"
              >
                Ir para o Painel
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-gray-900">
                  Conectar Meta Ads
                </h2>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Conecte sua conta de anúncios do Facebook/Instagram para começar a gerenciar campanhas com FURY
                </p>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                <p className="text-sm text-gray-700 font-medium flex items-start gap-3">
                  <svg className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2z" clipRule="evenodd" />
                  </svg>
                  <span>Você será redirecionado para autorizar a conexão</span>
                </p>
              </div>

              <Button
                onClick={handleConnectMeta}
                variant="primary"
                className="w-full text-white font-semibold"
                size="md"
              >
                Conectar Conta Meta
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
