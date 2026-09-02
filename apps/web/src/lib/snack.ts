/**
 * Snack global (toast temporário) — sobrevive à navegação porque o SnackHost
 * vive fora das rotas (no AuthenticatedShell). O projeto não tem lib de toast;
 * este é o padrão mínimo do repo (mensagem fixa top-right, auto-dismiss 3s).
 */

export type SnackType = 'success' | 'error';

export interface Snack {
  id: number;
  message: string;
  type: SnackType;
}

type Listener = (snack: Snack | null) => void;

let current: Snack | null = null;
let listeners: Listener[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let nextId = 1;

export function showSnack(message: string, type: SnackType = 'success') {
  current = { id: nextId++, message, type };
  listeners.forEach((l) => l(current));
  clearTimeout(timer);
  timer = setTimeout(() => {
    current = null;
    listeners.forEach((l) => l(null));
  }, 3000);
}

/** Assina mudanças de snack; retorna um cleanup. */
export function onSnackChange(listener: Listener): () => void {
  listeners.push(listener);
  if (current) listener(current);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}