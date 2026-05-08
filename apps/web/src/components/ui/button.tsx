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
        'font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed',
        !isPrimary && variant === 'default' &&
          'bg-[#1C1C1E] text-white hover:bg-[#2a2a2d] active:bg-[#0f0f11] shadow-sm',
        isPrimary &&
          'text-white shadow-md hover:shadow-lg active:shadow-sm hover:brightness-95 active:brightness-90',
        variant === 'outline' &&
          'border-2 border-[#E0E0E0] text-[#1C1C1E] hover:bg-[#F6F8FA] active:bg-white font-medium',
        variant === 'ghost' &&
          'text-[#1C1C1E] hover:bg-[#F6F8FA] active:bg-white',
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
