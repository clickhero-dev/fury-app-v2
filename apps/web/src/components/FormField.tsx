import type { InputHTMLAttributes } from 'react';
import { Input } from './ui/input';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Label exibido acima do input. */
  label: string;
  /** Mensagem de erro exibida abaixo do input em vermelho. */
  error?: string;
}

/**
 * Campo de formulário com label e mensagem de erro integrados.
 *
 * Combina um `<label>` acessível com o componente `Input` e exibição
 * opcional de erro. O `id` do input é inferido do `name` se não fornecido,
 * garantindo a associação correta entre label e input.
 *
 * Aceita todas as props nativas de `<input>` via `InputHTMLAttributes`.
 *
 * @example
 * <FormField
 *   label="E-mail"
 *   name="email"
 *   type="email"
 *   placeholder="seu@email.com"
 *   error={errors.email?.message}
 * />
 */
export function FormField({ label, error, id, ...props }: FormFieldProps) {
  // Usa `name` como fallback para `id` garantindo acessibilidade via htmlFor
  const inputId = id || props.name;

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-sm font-bold text-text-primary">
        {label}
      </label>
      <Input id={inputId} {...props} />
      {error && <p className="text-xs font-semibold text-red-600 mt-1">{error}</p>}
    </div>
  );
}