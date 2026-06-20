import { useEffect, useRef, useState } from 'react';

/** Score atualizado de uma campanha específica, recebido via SSE. */
export interface FuryScoreUpdate {
  campaignId: string;
  campaignName: string;
  score: number;
  grade: string;
}

/**
 * Payload completo de uma atualização SSE do FURY Engine.
 * Enviado a cada ciclo de execução do engine (a cada 30 minutos).
 */
export interface FurySSEUpdate {
  timestamp: string;
  scores: FuryScoreUpdate[];
}

/**
 * Hook que estabelece uma conexão SSE (Server-Sent Events) com o FURY Engine.
 *
 * Escuta atualizações em tempo real de scores de campanhas emitidas pelo backend
 * via `GET /api/automation/feed`. A conexão é autenticada via token JWT na query string.
 *
 * - Conecta automaticamente ao montar o componente.
 * - Desconecta automaticamente ao desmontar.
 * - Ignora mensagens com formato inválido silenciosamente.
 * - Só conecta se houver token no localStorage.
 *
 * @returns `lastUpdate` - Último payload recebido do FURY Engine, ou `null` se ainda não recebeu
 * @returns `isConnected` - `true` se a conexão SSE está ativa
 *
 * @example
 * const { lastUpdate, isConnected } = useFurySSE();
 *
 * if (lastUpdate) {
 *   console.log('Scores atualizados:', lastUpdate.scores);
 * }
 */
export function useFurySSE() {
  const [lastUpdate, setLastUpdate] = useState<FurySSEUpdate | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const apiUrl = import.meta.env.VITE_API_URL;

    // Remove o sufixo /api se presente para evitar duplicação na URL do SSE
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
        // Ignora mensagens com formato inválido
      }
    });

    // Fecha a conexão SSE ao desmontar o componente
    return () => {
      es.close();
      setIsConnected(false);
    };
  }, []);

  return { lastUpdate, isConnected };
}