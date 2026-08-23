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
        'font-semibold rounded-full transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed relative inline-flex items-center justify-center cursor-pointer',
        
        // Primary: Azul/Turquesa (#1E88A8) com texto escuro
        variant === 'primary' &&
          'bg-[#1E88A8] text-[#0C0D0A] hover:bg-[#1E88A8]/90 hover:scale-[1.02] active:scale-[0.98] shadow-sm',
        
        // Default: Fundo escuro leve com borda
        variant === 'default' &&
          'bg-[#1A1B17] text-[#ECEDEF] border border-[#262824] hover:bg-[#1F211D] hover:border-[#1E88A8]/50 active:bg-[#161814]',
        
        // Outline: Borda sutil com texto azul
        variant === 'outline' &&
          'border border-[#1E88A8] text-[#1E88A8] hover:bg-[#1E88A8]/10 active:bg-[#1E88A8]/20',
        
        // Ghost: Sem borda, hover suave
        variant === 'ghost' &&
          'text-[#9BA1A6] hover:text-[#ECEDEF] hover:bg-[#1A1B17]',
        
        // Destructive: Vermelho sutil
        variant === 'destructive' &&
          'bg-[#E5534B] text-white hover:bg-[#E5534B]/90 active:bg-[#E5534B]/80',

        // Spark: Laranja vibrante com texto branco (para chamadas de ação)
        variant === 'spark' &&
          'bg-[#F97316] text-white hover:bg-[#F97316]/90 hover:scale-[1.02] active:scale-[0.98] shadow-md hover:shadow-lg',

        // Soft: Fundo suave com texto colorido (para ações secundárias)
        variant === 'soft' &&
          'bg-[#1E88A8]/10 text-[#1E88A8] hover:bg-[#1E88A8]/20 active:bg-[#1E88A8]/30 border border-[#1E88A8]/20',

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