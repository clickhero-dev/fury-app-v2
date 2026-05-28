import type { InputHTMLAttributes } from 'react';
import { Input } from './ui/input';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function FormField({ label, error, id, ...props }: FormFieldProps) {
  const inputId = id || props.name;

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-sm font-bold text-white">
        {label}
      </label>
      <Input id={inputId} {...props} />
      {error && <p className="text-xs font-semibold text-red-300 mt-1">{error}</p>}
    </div>
  );
}
