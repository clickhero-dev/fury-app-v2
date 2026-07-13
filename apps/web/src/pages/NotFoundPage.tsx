import { Link } from 'react-router-dom';

/**
 * Página 404 — rota não encontrada.
 *
 * Exibe uma ilustração SVG com a identidade FURY (laranja #e8631a),
 * suporte a light/dark mode, e botão de retorno ao início.
 *
 * Funciona como catch-all no router.tsx (path: '*').
 */
export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
      {/* Ilustração: "4" + círculo FURY + "4" com efeito de radar */}
      <div className="relative mb-10 select-none">
        <svg
          width="280"
          height="180"
          viewBox="0 0 280 180"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {/* Primeiro "4" */}
          <text
            x="30"
            y="150"
            fontSize="160"
            fontWeight="700"
            fontFamily="system-ui, -apple-system, sans-serif"
            fill="var(--color-text-primary)"
            opacity="0.08"
          >
            4
          </text>

          {/* Círculo externo do radar (pulsa) */}
          <circle
            cx="140"
            cy="90"
            r="58"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2"
            opacity="0.15"
          >
            <animate
              attributeName="r"
              values="58;68;58"
              dur="3s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.15;0.05;0.15"
              dur="3s"
              repeatCount="indefinite"
            />
          </circle>

          {/* Círculo médio do radar */}
          <circle
            cx="140"
            cy="90"
            r="48"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2"
            opacity="0.25"
          >
            <animate
              attributeName="r"
              values="48;56;48"
              dur="3s"
              begin="0.5s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.25;0.08;0.25"
              dur="3s"
              begin="0.5s"
              repeatCount="indefinite"
            />
          </circle>

          {/* Círculo preenchido — o "0" do 404 vira o centro do radar */}
          <circle
            cx="140"
            cy="90"
            r="38"
            fill="var(--color-accent)"
            opacity="0.12"
          />
          <circle
            cx="140"
            cy="90"
            r="26"
            fill="var(--color-accent)"
            opacity="0.2"
          />

          {/* "F" central (como o favicon) */}
          <rect
            x="122"
            y="72"
            width="36"
            height="36"
            rx="8"
            fill="var(--color-accent)"
          />
          <text
            x="140"
            y="97"
            textAnchor="middle"
            fontSize="26"
            fontWeight="700"
            fontFamily="system-ui, -apple-system, sans-serif"
            fill="white"
          >
            F
          </text>

          {/* Segundo "4" */}
          <text
            x="220"
            y="150"
            fontSize="160"
            fontWeight="700"
            fontFamily="system-ui, -apple-system, sans-serif"
            fill="var(--color-text-primary)"
            opacity="0.08"
          >
            4
          </text>

          {/* Tracejado "rota perdida" saindo do radar */}
          <path
            d="M178 72 Q200 50 240 55"
            stroke="var(--color-text-tertiary)"
            strokeWidth="2"
            strokeDasharray="4 4"
            opacity="0.4"
            fill="none"
          >
            <animate
              attributeName="strokeDashoffset"
              values="0;-16"
              dur="2s"
              repeatCount="indefinite"
            />
          </path>

          {/* Pontinho no fim da rota */}
          <circle
            cx="240"
            cy="55"
            r="4"
            fill="var(--color-text-tertiary)"
            opacity="0.3"
          />

          {/* Aspas indicando "rota quebrada" */}
          <path
            d="M248 48 L250 52 M254 48 L256 52"
            stroke="var(--color-text-tertiary)"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.25"
          />
        </svg>
      </div>

      {/* Título */}
      <h1 className="text-2xl sm:text-3xl font-bold text-text-primary mb-3 text-center">
        Página não encontrada
      </h1>

      {/* Subtítulo */}
      <p className="text-text-secondary text-center max-w-md mb-8 text-sm sm:text-base leading-relaxed">
        O caminho que você seguiu não leva a lugar nenhum.
        A página pode ter sido movida ou o endereço está incorreto.
      </p>

      {/* Botão de volta */}
      <Link
        to="/"
        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-white font-medium text-sm
                   hover:brightness-110 active:brightness-95 transition-all duration-200
                   shadow-lg shadow-accent/25 hover:shadow-xl hover:shadow-accent/30"
      >
        {/* Ícone de seta */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M6.66667 12.6667L2 8.00001M2 8.00001L6.66667 3.33334M2 8.00001L14 8.00001"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Voltar ao início
      </Link>

      {/* Footer discreto */}
      <p className="mt-12 text-xs text-text-tertiary">
        <span className="text-accent/60 font-medium">FURY</span> — erro 404
      </p>
    </div>
  );
}
