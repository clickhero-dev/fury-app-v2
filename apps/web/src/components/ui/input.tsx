import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        'w-full px-4 py-3.5 border border-[#27272A] rounded-xl bg-[#27272A]/50 backdrop-blur-sm text-white placeholder-zinc-400 transition-all duration-200 focus:outline-none focus:border-[#EA580C] focus:ring-2 focus:ring-[#EA580C]/40 hover:border-[#36363A] hover:bg-[#27272A]/70 disabled:opacity-50 disabled:bg-[#27272A]/30 disabled:cursor-not-allowed text-base',
        className
      )}
      {...props}
    />
  );
}
