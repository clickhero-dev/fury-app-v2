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
          'bg-gray-100 text-gray-900 hover:bg-gray-200 active:bg-gray-300 shadow-sm',
        isPrimary &&
          'text-white shadow-xl hover:shadow-2xl hover:shadow-[#FF6B35]/60 active:shadow-lg hover:brightness-125 active:brightness-110',
        variant === 'outline' &&
          'border-2 border-[#E8631A] text-[#E8631A] hover:bg-orange-50 active:bg-orange-100 font-bold',
        variant === 'ghost' &&
          'text-gray-700 hover:bg-gray-100 active:bg-gray-200',
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
