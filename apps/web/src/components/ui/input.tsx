import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        'w-full px-4 py-3 border border-[#FF6B35]/20 rounded-lg bg-[#2A2A2E] backdrop-blur-sm text-white placeholder-zinc-500 transition-all duration-200 focus:outline-none focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/40 hover:border-[#FF6B35]/30 hover:bg-[#2A2A2E] disabled:opacity-50 disabled:bg-[#1F1F23] disabled:cursor-not-allowed text-base font-medium',
        className
      )}
      {...props}
    />
  );
}
