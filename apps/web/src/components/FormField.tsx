import type { InputHTMLAttributes } from 'react';
import { Input } from './ui/input';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function FormField({ label, error, id, ...props }: FormFieldProps) {
  const inputId = id || props.name;

  return (
    <div className="space-y-3">
      <label htmlFor={inputId} className="block text-sm font-semibold text-[#1C1C1E]">
        {label}
      </label>
      <Input id={inputId} {...props} />
      {error && <p className="text-xs font-semibold text-[#DA3633]">{error}</p>}
    </div>
  );
}
