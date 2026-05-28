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
        'font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed relative',
        !isPrimary && variant === 'default' &&
          'bg-[#27272A] text-white hover:bg-[#36363A] active:bg-[#1F1F23] shadow-sm',
        isPrimary &&
          'text-white shadow-lg hover:shadow-2xl hover:shadow-[#EA580C]/50 active:shadow-md hover:brightness-110 active:brightness-100',
        variant === 'outline' &&
          'border-2 border-[#27272A] text-white hover:bg-[#27272A]/50 active:bg-[#27272A] font-medium',
        variant === 'ghost' &&
          'text-white hover:bg-[#27272A]/30 active:bg-[#27272A]',
        size === 'sm' && 'px-4 py-2.5 text-sm',
        size === 'md' && 'px-6 py-3.5 text-base font-semibold',
        size === 'lg' && 'px-8 py-4 text-lg',
        className
      )}
      style={buttonStyle}
      {...props}
    />
  );
}
