import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function MetaAuthorizePage() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/onboarding/conectar-meta?connected=true', { replace: true });
    }, 2000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="text-center space-y-8 max-w-md">
        <div className="space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100">
            <svg className="w-8 h-8 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Conectando ao Facebook</h1>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#E8631A' }}></div>
            <p className="text-gray-700 font-medium">Autorizando sua conta...</p>
          </div>
          <p className="text-sm text-gray-500">Você será redirecionado em breve</p>
        </div>

        <div className="pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Demo</p>
          <p className="text-xs text-gray-400 mt-2">Simulação de autorização OAuth</p>
        </div>
      </div>
    </div>
  );
}
