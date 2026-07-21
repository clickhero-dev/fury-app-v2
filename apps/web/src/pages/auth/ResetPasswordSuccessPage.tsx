import { useNavigate } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';

export function ResetPasswordSuccessPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-[400px]">

        {/* Logo + tagline */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#EA580C] mb-4">
            <span className="text-white font-black text-xl">F</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">FURY</h1>
          <p className="text-sm text-gray-400 mt-1">Automação de tráfego pago com IA</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
          <div className="text-center space-y-6">

            {/* Success Icon */}
            <div className="flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-green-100 rounded-full blur-lg opacity-50" />
                <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-50">
                  <CheckCircle className="w-8 h-8 text-green-600" strokeWidth={1.5} />
                </div>
              </div>
            </div>

            {/* Heading */}
            <div>
              <h2 className="text-2xl font-black text-gray-900 mb-2">Sucesso!</h2>
              <p className="text-gray-600 text-sm leading-relaxed">
                Sua senha foi redefinida com sucesso. Agora você pode entrar com sua nova senha.
              </p>
            </div>

            {/* Action Button */}
            <button
              onClick={() => navigate('/login')}
              className="w-full bg-[#EA580C] hover:bg-[#D4520B] text-white font-bold py-3 rounded-xl text-sm transition-colors"
            >
              Ir para login
            </button>

          </div>
        </div>

      </div>
    </div>
  );
}
