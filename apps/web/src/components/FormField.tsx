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
      <label htmlFor={inputId} className="text-sm font-medium text-gray-900">
        {label}
      </label>
      <Input id={inputId} {...props} />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
