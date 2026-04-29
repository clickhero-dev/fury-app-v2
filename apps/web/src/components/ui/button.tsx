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
        'font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed',
        !isPrimary && variant === 'default' &&
          'bg-gray-900 text-white hover:bg-gray-800 active:bg-gray-950',
        isPrimary &&
          'text-white hover:opacity-95 active:opacity-90 shadow-sm hover:shadow-md',
        variant === 'outline' &&
          'border border-gray-200 text-gray-900 hover:bg-gray-50 active:bg-gray-100',
        variant === 'ghost' &&
          'text-gray-700 hover:bg-gray-100 active:bg-gray-200',
        size === 'sm' && 'px-3 py-1.5 text-sm',
        size === 'md' && 'px-4 py-2.5 text-base',
        size === 'lg' && 'px-6 py-3 text-lg',
        className
      )}
      style={buttonStyle}
      {...props}
    />
  );
}
