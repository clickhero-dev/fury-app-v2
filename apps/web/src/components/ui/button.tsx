import type { ButtonHTMLAttributes, CSSProperties } from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'outline' | 'ghost' | 'destructive' | 'spark' | 'soft';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({
  variant = 'default',
  size = 'md',
  className,
  style,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'ady-btn font-semibold rounded-full transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed relative inline-flex items-center justify-center cursor-pointer',

        // Primary: Petróleo com texto branco — autocontido, mesma aparência nos dois temas
        // 17708A (não 1E88A8): branco sobre 1E88A8 mede ~4.1:1, abaixo do AA (4.5:1) — medido via accesslint
        variant === 'primary' &&
          'bg-[#17708A] text-white hover:bg-[#17708A]/90 hover:scale-[1.02] active:scale-[0.98] shadow-sm',

        // Default: Superfície secundária com borda — usa tokens (bg-surface-secondary/border-border-light/text-text-primary), resolve certo nos dois temas
        variant === 'default' &&
          'bg-surface-secondary text-text-primary border border-border-light hover:border-brand/50 hover:brightness-95 dark:hover:brightness-125 active:brightness-90',

        // Outline: Borda petróleo com texto petróleo (17708A no claro / 1E88A8 no escuro — regra AA do guia de marca)
        variant === 'outline' &&
          'border border-[#1E88A8] text-[#17708A] dark:text-[#1E88A8] hover:bg-[#1E88A8]/10 active:bg-[#1E88A8]/20',

        // Ghost: Sem borda, texto terciário (token), hover com superfície secundária
        variant === 'ghost' &&
          'text-text-tertiary hover:text-text-primary hover:bg-surface-secondary',

        // Destructive: Vermelho sólido com texto branco — autocontido
        variant === 'destructive' &&
          'bg-[#E5534B] text-white hover:bg-[#E5534B]/90 active:bg-[#E5534B]/80',

        // Spark: Faísca da marca — B55F02 (não CF6F03): branco sobre CF6F03 mede 3.54:1, abaixo do AA
        variant === 'spark' &&
          'bg-[#B55F02] text-white hover:bg-[#B55F02]/90 hover:scale-[1.02] active:scale-[0.98] shadow-md hover:shadow-lg',

        // Soft: Fundo suave com texto petróleo (mesma regra de contraste da outline)
        variant === 'soft' &&
          'bg-[#1E88A8]/10 text-[#17708A] dark:text-[#1E88A8] hover:bg-[#1E88A8]/20 active:bg-[#1E88A8]/30 border border-[#1E88A8]/20',

        // Tamanhos
        size === 'sm' && 'px-4 py-2 text-xs',
        size === 'md' && 'px-5 py-2.5 text-xs',
        size === 'lg' && 'px-6 py-3 text-sm',
        className
      )}
      style={style}
      {...props}
    />
  );
}