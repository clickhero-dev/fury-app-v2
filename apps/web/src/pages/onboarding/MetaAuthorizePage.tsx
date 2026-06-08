import { useEffect, useState } from 'react';
import api from '@/lib/api';

export function MetaAuthorizePage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ success: boolean; data: { authUrl: string } }>('/meta/auth/url')
      .then((res) => {
        const authUrl = res.data.data.authUrl;
        console.log('[MetaAuthorizePage] redirecting to Meta OAuth:', authUrl.substring(0, 60) + '...');
        window.location.href = authUrl;
      })
      .catch((err) => {
        console.error('[MetaAuthorizePage] failed to get auth URL:', err);
        setError('Não foi possível iniciar a conexão com o Meta. Tente novamente.');
      });
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <p className="text-red-600 font-medium">{error}</p>
          <button
            onClick={() => window.history.back()}
            className="text-sm text-[#6E7681] underline hover:text-[#1C1C1E]"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="text-center space-y-8 max-w-md">
        <div className="space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100">
            <svg className="w-8 h-8 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Conectando ao Meta</h1>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#E8631A' }} />
            <p className="text-gray-700 font-medium">Redirecionando para o Meta...</p>
          </div>
          <p className="text-sm text-gray-500">Você será redirecionado em instantes</p>
        </div>
      </div>
    </div>
  );
}
