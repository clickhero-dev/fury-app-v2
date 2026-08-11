import { useEffect, useState, useRef } from 'react';

/** Evento recebido via SSE do FURY Engine. */
export interface FuryFeedEvent {
  event: string;
  data: unknown;
  timestamp: string;
}

/** Estado completo da conexão SSE do live feed. */
interface FuryLiveFeedState {
  events: FuryFeedEvent[];
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  reconnectAttempts: number;
}

/**
 * Delays progressivos de reconexão em milissegundos.
 * A cada tentativa falha, aguarda mais tempo antes de tentar novamente.
 */
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000];

/** Tempo máximo de espera pelo token JWT antes de desistir (ms). */
const TOKEN_WAIT_TIMEOUT = 3000;

/**
 * Aguarda o token JWT estar disponível no localStorage por até `timeoutMs` milissegundos.
 * Útil para casos onde o hook monta antes do login ser concluído.
 *
 * @param timeoutMs - Tempo máximo de espera em milissegundos
 * @returns Token JWT encontrado ou `null` se o timeout expirar
 */
async function waitForToken(timeoutMs: number): Promise<string | null> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const token = localStorage.getItem('token');
    if (token) {
      console.log('[SSE] Token found after waiting');
      return token;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  console.warn(`[SSE] Token not found after ${timeoutMs}ms`);
  return null;
}

/**
 * Hook para receber eventos em tempo real do FURY Engine via SSE (Server-Sent Events).
 *
 * Conecta ao endpoint `/api/fury/live-feed` e escuta eventos do tipo:
 * - `fury:update` — atualização de scores de campanhas
 * - `rule_triggered` — regra de automação disparada
 *
 * Funcionalidades:
 * - Reconexão automática com backoff progressivo (1s → 2s → 5s → 10s)
 * - Aguarda até 3 segundos pelo token JWT antes de desistir
 * - Mantém os últimos 50 eventos em memória
 * - Limpa a conexão ao desmontar o componente
 *
 * @returns Estado completo da conexão com eventos recebidos
 *
 * @example
 * const { events, isConnected, isConnecting, error } = useFuryLiveFeed();
 *
 * if (isConnecting) return <Spinner />;
 * if (!isConnected) return <p>Desconectado</p>;
 */
export function useFuryLiveFeed() {
  const [state, setState] = useState<FuryLiveFeedState>({
    events: [],
    isConnected: false,
    isConnecting: true,
    error: null,
    reconnectAttempts: 0,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  const connect = async () => {
    if (!isMountedRef.current) return;

    console.log('[SSE] Attempting to connect...');

    const token = await waitForToken(TOKEN_WAIT_TIMEOUT);
    if (!token) {
      if (!isMountedRef.current) return;
      setState({
        events: [],
        isConnected: false,
        isConnecting: false,
        error: 'Token não encontrado. Faça login novamente.',
        reconnectAttempts: 0,
      });
      return;
    }

    if (!isMountedRef.current) return;
    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    const apiUrl = import.meta.env.VITE_API_URL;
    const baseUrl = apiUrl.replace(/\/$/, '');
    const eventSource = new EventSource(`${baseUrl}/fury/live-feed?token=${token}`);
    eventSourceRef.current = eventSource;

    const handleMessage = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data) as FuryFeedEvent;

        if (parsed.event === 'fury:update' || parsed.event === 'rule_triggered') {
          console.log('[SSE] Event received:', parsed.event);
          if (isMountedRef.current) {
            setState((prev) => {
              if (!prev.isConnected) {
                console.log('[SSE] Connection established - first message received');
              }
              return {
                ...prev,
                events: [parsed, ...prev.events].slice(0, 50), // Mantém os últimos 50 eventos
                isConnected: true,
                isConnecting: false,
                error: null,
                reconnectAttempts: 0,
              };
            });
          }
        }
      } catch (error) {
        console.warn('[SSE] Failed to parse message:', error);
      }
    };

    const handleOpen = () => {
      console.log('[SSE] EventSource opened');
      if (isMountedRef.current) {
        setState((prev) => ({
          ...prev,
          isConnected: true,
          isConnecting: false,
          error: null,
          reconnectAttempts: 0,
        }));
      }
    };

    const handleError = () => {
      console.warn('[SSE] EventSource error - will attempt to reconnect');
      try {
        eventSource.close();
      } catch (e) {
        console.warn('[SSE] Error closing EventSource:', e);
      }

      if (!isMountedRef.current) return;

      setState((prev) => {
        const attempts = prev.reconnectAttempts + 1;
        // Usa delay progressivo, limitado ao maior valor da lista
        const delay = RECONNECT_DELAYS[Math.min(attempts - 1, RECONNECT_DELAYS.length - 1)];
        console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${attempts})`);

        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            connect();
          }
        }, delay);

        return {
          ...prev,
          isConnected: false,
          isConnecting: true,
          error: null,
          reconnectAttempts: attempts,
        };
      });
    };

    eventSource.addEventListener('message', handleMessage);
    eventSource.addEventListener('open', handleOpen);
    eventSource.addEventListener('error', handleError);
  };

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      if (eventSourceRef.current) {
        try {
          eventSourceRef.current.close();
        } catch (e) {
          console.warn('[SSE] Error closing EventSource on unmount:', e);
        }
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  return state;
}