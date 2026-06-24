import { useEffect, useState, useRef } from 'react';

export interface FuryFeedEvent {
  event: string;
  data: unknown;
  timestamp: string;
}

interface FuryLiveFeedState {
  events: FuryFeedEvent[];
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  reconnectAttempts: number;
}

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000];
const TOKEN_WAIT_TIMEOUT = 3000;

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

    const apiUrl = 'https://clickhero-fury-api.u7pe19.easypanel.host/api';
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
                events: [parsed, ...prev.events].slice(0, 50),
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
