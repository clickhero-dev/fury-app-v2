import { useRef, useEffect, useState } from 'react';

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  error?: string;
}

/**
 * Componente genérico para entrada de código OTP (um-time password).
 * Renderiza campos individuais para cada dígito, com navegação automática
 * entre campos, suporte a paste, e validação de entrada.
 */
export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled = false,
  error,
}: OtpInputProps) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const [internalValue, setInternalValue] = useState(value);

  useEffect(() => {
    setInternalValue(value);
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const inputValue = e.target.value;

    if (!/^\d*$/.test(inputValue)) {
      return;
    }

    const digit = inputValue.charAt(inputValue.length - 1) || '';
    const newValue = internalValue.split('');
    newValue[index] = digit;
    const fullValue = newValue.join('');

    setInternalValue(fullValue);
    onChange(fullValue);

    // Auto-advance to next field
    if (digit && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }

    // Trigger onComplete when all digits are filled
    if (fullValue.length === length && onComplete) {
      onComplete(fullValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace') {
      const newValue = internalValue.split('');
      if (newValue[index]) {
        newValue[index] = '';
      } else if (index > 0) {
        newValue[index - 1] = '';
        inputsRef.current[index - 1]?.focus();
      }
      const fullValue = newValue.join('');
      setInternalValue(fullValue);
      onChange(fullValue);
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);

    if (!pastedData) return;

    const newValue = (pastedData + internalValue).slice(0, length);
    setInternalValue(newValue);
    onChange(newValue);

    if (newValue.length === length && onComplete) {
      onComplete(newValue);
    }

    if (pastedData.length > 0) {
      const focusIndex = Math.min(pastedData.length, length - 1);
      inputsRef.current[focusIndex]?.focus();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 justify-center">
        {Array.from({ length }).map((_, index) => (
          <input
            key={index}
            ref={(el) => {
              inputsRef.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={internalValue[index] || ''}
            onChange={(e) => handleInputChange(e, index)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            onPaste={handlePaste}
            disabled={disabled}
            aria-label={`Dígito ${index + 1} do código OTP`}
            className={`
              w-12 h-12 text-center text-lg font-bold rounded-lg
              border-2 transition-all duration-200
              ${
                error
                  ? 'border-red-500 bg-red-50/50'
                  : internalValue[index]
                    ? 'border-[#FF6B35] bg-[#FF6B35]/5'
                    : 'border-[#E0E0E0] bg-white'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-text'}
              focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/50
              placeholder:text-[#B8B8C0]
            `}
          />
        ))}
      </div>

      {error && <p className="text-xs font-semibold text-red-600 text-center">{error}</p>}
    </div>
  );
}
