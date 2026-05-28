import type { ButtonHTMLAttributes, CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { FURY_COLORS } from '@/lib/constants';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({
  variant = 'default',
  size = 'md',
  className,
  style,
  ...props
}: ButtonProps) {
  const isPrimary = variant === 'primary';
  const buttonStyle: CSSProperties | undefined = isPrimary
    ? {
        backgroundColor: FURY_COLORS.primary,
        ...style,
      }
    : style;

  return (
    <button
      className={cn(
        'font-bold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed relative',
        !isPrimary && variant === 'default' &&
          'bg-[#2A2A2E] text-white hover:bg-[#36363A] active:bg-[#1F1F23] shadow-sm',
        isPrimary &&
          'text-white shadow-xl hover:shadow-2xl hover:shadow-[#FF6B35]/60 active:shadow-lg hover:brightness-125 active:brightness-110',
        variant === 'outline' &&
          'border-2 border-[#FF6B35]/40 text-white hover:bg-[#FF6B35]/10 active:bg-[#FF6B35]/20 font-bold',
        variant === 'ghost' &&
          'text-white hover:bg-[#2A2A2E]/50 active:bg-[#2A2A2E]',
        size === 'sm' && 'px-4 py-2.5 text-sm',
        size === 'md' && 'px-6 py-3 text-base font-bold',
        size === 'lg' && 'px-8 py-4 text-lg',
        className
      )}
      style={buttonStyle}
      {...props}
    />
  );
}
