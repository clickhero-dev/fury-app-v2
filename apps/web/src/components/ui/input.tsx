import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        'w-full px-4 py-3.5 border border-[#E0E0E0] rounded-xl bg-white text-[#1C1C1E] placeholder-[#6E7681] transition-all duration-200 focus:outline-none focus:border-[#E8631A] focus:ring-1 focus:ring-[#E8631A]/20 disabled:opacity-50 disabled:bg-[#F6F8FA] text-base',
        className
      )}
      {...props}
    />
  );
}
