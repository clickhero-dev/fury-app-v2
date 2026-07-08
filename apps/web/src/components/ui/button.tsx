import type { ButtonHTMLAttributes, CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { FURY_COLORS } from '@/lib/constants';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'outline' | 'ghost' | 'destructive';
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
          'bg-surface-secondary text-text-primary hover:bg-border-light active:bg-border shadow-sm border border-border',
        isPrimary &&
          'text-white shadow-xl hover:shadow-2xl hover:shadow-[#FF6B35]/60 active:shadow-lg hover:brightness-125 active:brightness-110',
        variant === 'outline' &&
          'border-2 border-[#E8631A] text-[#E8631A] hover:bg-orange-50 active:bg-orange-100 font-bold',
        variant === 'ghost' &&
          'text-text-secondary hover:bg-surface-secondary active:bg-border-light',
        variant === 'destructive' &&
          'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm',
        size === 'sm' && 'px-4 py-2.5 text-sm',
        size === 'md' && 'px-6 py-3 text-base font-bold',
        size === 'lg' && 'px-8 py-3 text-lg',
        className
      )}
      style={buttonStyle}
      {...props}
    />
  );
}
