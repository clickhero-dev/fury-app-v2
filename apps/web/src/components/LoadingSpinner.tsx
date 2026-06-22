interface LoadingSpinnerProps {
  /** Tamanho do spinner. Padrão: 'md'. */
  size?: 'sm' | 'md' | 'lg';
  /**
   * Se `true`, renderiza o spinner centralizado sobre um overlay branco
   * cobrindo toda a tela (posição fixed, z-index 50).
   * Útil para carregamentos de página inteira.
   */
  fullPage?: boolean;
}

/** Classes de tamanho do spinner mapeadas por variante. */
const sizeClasses = {
  sm: 'w-4 h-4 border-2',
  md: 'w-7 h-7 border-[3px]',
  lg: 'w-11 h-11 border-4',
};

/**
 * Spinner de carregamento animado com as cores da marca FURY.
 *
 * Usa bordas CSS com rotação para criar o efeito de carregamento.
 * A borda superior é colorida (laranja) e as demais são claras.
 *
 * @param size - Tamanho do spinner: 'sm', 'md' (padrão) ou 'lg'
 * @param fullPage - Se `true`, cobre toda a tela com overlay semitransparente
 *
 * @example
 * // Inline (padrão)
 * <LoadingSpinner />
 *
 * @example
 * // Tamanho pequeno
 * <LoadingSpinner size="sm" />
 *
 * @example
 * // Tela cheia
 * <LoadingSpinner size="lg" fullPage />
 */
export function LoadingSpinner({ size = 'md', fullPage = false }: LoadingSpinnerProps) {
  const spinner = (
    <div
      className={`
        rounded-full animate-spin
        border-[#FEF0E7] border-t-[#E8631A]
        ${sizeClasses[size]}
      `}
    />
  );

  if (fullPage) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white/80 z-50">
        {spinner}
      </div>
    );
  }

  return spinner;
}

export default LoadingSpinner;