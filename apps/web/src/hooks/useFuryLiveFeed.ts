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

function getInitialState(): FuryLiveFeedState {
  const token = localStorage.getItem('token');
  return {
    events: [],
    isConnected: false,
    isConnecting: !token,
    error: token ? null : 'Token não encontrado. Faça login novamente.',
    reconnectAttempts: 0,
  };
}

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000];

export function useFuryLiveFeed() {
  const [state, setState] = useState<FuryLiveFeedState>(getInitialState);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setState({
        events: [],
        isConnected: false,
        isConnecting: false,
        error: 'Token não encontrado. Faça login novamente.',
        reconnectAttempts: 0,
      });
      return;
    }

    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
    const eventSource = new EventSource(`${apiUrl}/fury/live-feed?token=${token}`);
    eventSourceRef.current = eventSource;

    const handleMessage = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data) as FuryFeedEvent;
        setState((prev) => ({
          ...prev,
          events: [parsed, ...prev.events].slice(0, 50),
          isConnected: true,
          isConnecting: false,
          error: null,
          reconnectAttempts: 0,
        }));
      } catch (error) {
        console.warn('Failed to parse SSE message:', error);
      }
    };

    const handleOpen = () => {
      setState((prev) => ({
        ...prev,
        isConnected: true,
        isConnecting: false,
        error: null,
        reconnectAttempts: 0,
      }));
    };

    const handleError = () => {
      eventSource.close();
      setState((prev) => {
        const attempts = prev.reconnectAttempts + 1;
        const delay = RECONNECT_DELAYS[Math.min(attempts - 1, RECONNECT_DELAYS.length - 1)];

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);

        return {
          ...prev,
          isConnected: false,
          isConnecting: false,
          error: `Reconectando em ${delay / 1000}s...`,
          reconnectAttempts: attempts,
        };
      });
    };

    eventSource.addEventListener('message', handleMessage);
    eventSource.addEventListener('open', handleOpen);
    eventSource.addEventListener('error', handleError);
  };

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  return state;
}
