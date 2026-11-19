import { useId, useState, type ComponentPropsWithRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PasswordInputProps extends Omit<ComponentPropsWithRef<'input'>, 'type'> {
  visibilityLabel?: string;
}

/** Campo protegido com visualização local independente por instância. */
export function PasswordInput({ id, className, disabled, visibilityLabel = 'senha', ...props }: PasswordInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <span className="relative block ph-no-capture ph-mask" data-ph-no-capture>
      <input
        {...props}
        id={inputId}
        type={visible ? 'text' : 'password'}
        disabled={disabled}
        className={cn(className, 'pr-12 ph-no-capture ph-mask')}
        data-ph-no-capture
      />
      <button
        type="button"
        disabled={disabled}
        aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${visibilityLabel}`}
        aria-controls={inputId}
        aria-pressed={visible}
        onClick={() => setVisible((value) => !value)}
        className="ady-btn absolute right-1 top-1/2 -translate-y-1/2 inline-flex size-9 items-center justify-center rounded-md text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
      >
        {visible ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
      </button>
    </span>
  );
}
