import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Combina classes CSS com suporte a condicionais (clsx) e resolução
 * de conflitos do Tailwind CSS (tailwind-merge).
 *
 * É o utilitário padrão para composição de classes em todos os componentes.
 *
 * @param inputs - Classes CSS, objetos condicionais ou arrays
 * @returns String de classes CSS mescladas e sem conflitos
 *
 * @example
 * cn('px-4 py-2', isActive && 'bg-primary', className)
 * cn('text-sm', { 'font-bold': isBold, 'text-red-500': hasError })
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formata um número de telefone brasileiro enquanto o usuário digita.
 * Suporta formatos de 8 dígitos (fixo) e 9 dígitos (celular).
 *
 * @param value - String com dígitos do telefone (com ou sem formatação)
 * @returns Telefone formatado no padrão brasileiro
 *
 * @example
 * formatPhone('11987654321') // → '(11) 98765-4321'
 * formatPhone('1134567890')  // → '(11) 3456-7890'
 * formatPhone('11')          // → '(11'
 */
export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/** Cores principais da identidade visual FURY. */
export const FURY_COLORS = {
  primary: '#E8631A',
  primaryDark: '#d45316',
};