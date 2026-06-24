import { useEffect, useRef, useState } from 'react';

export interface FuryScoreUpdate {
  campaignId: string;
  campaignName: string;
  score: number;
  grade: string;
}

export interface FurySSEUpdate {
  timestamp: string;
  scores: FuryScoreUpdate[];
}

export function useFurySSE() {
  const [lastUpdate, setLastUpdate] = useState<FurySSEUpdate | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const apiUrl = 'https://clickhero-fury-api.u7pe19.easypanel.host/api';
    const es = new EventSource(`${apiUrl}/automation/feed?token=${token}`);
    esRef.current = es;

    es.addEventListener('open', () => setIsConnected(true));
    es.addEventListener('error', () => setIsConnected(false));

    es.addEventListener('message', (event: MessageEvent) => {
      try {
        const envelope = JSON.parse(event.data as string) as {
          event: string;
          data: unknown;
          timestamp: string;
        };
        if (envelope.event === 'fury:update') {
          setLastUpdate(envelope.data as FurySSEUpdate);
        }
      } catch {
        // ignore malformed messages
      }
    });

    return () => {
      es.close();
      setIsConnected(false);
    };
  }, []);

  return { lastUpdate, isConnected };
}
