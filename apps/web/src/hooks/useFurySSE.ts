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

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    // Remove trailing /api if present to avoid duplication
    const baseUrl = apiUrl.endsWith('/api') ? apiUrl.slice(0, -4) : apiUrl;
    const es = new EventSource(`${baseUrl}/api/automation/feed?token=${token}`);
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
