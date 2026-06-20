import { useEffect, useState } from 'react';

/** Item do feed de automações executadas pelo FURY Engine. */
export interface AutomationFeedItem {
  id: string;
  /** Tipo de ação executada na campanha. */
  type: 'pause' | 'resume' | 'optimize' | 'scale';
  campaignName: string;
  message: string;
  timestamp: number;
}

/**
 * Hook para receber o feed de automações executadas em tempo real via SSE.
 *
 * Conecta ao endpoint `/api/automation/feed` e exibe as ações mais recentes
 * do FURY Engine (pausas, retomadas, otimizações e escalas de campanhas).
 *
 * - Mantém os últimos 10 eventos em memória.
 * - Só conecta se houver token no localStorage.
 * - Reconexão automática gerenciada pelo próprio browser via EventSource.
 * - Desconecta ao desmontar o componente.
 *
 * @returns `feed` - Lista dos últimos 10 eventos de automação
 * @returns `isConnected` - `true` se a conexão SSE está ativa
 *
 * @example
 * const { feed, isConnected } = useAutomationFeed();
 *
 * return (
 *   <ul>
 *     {feed.map(item => <li key={item.id}>{item.message}</li>)}
 *   </ul>
 * );
 */
export function useAutomationFeed() {
  const [feed, setFeed] = useState<AutomationFeedItem[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');

    if (!token) {
      console.warn('No token found, SSE feed disabled');
      return;
    }

    const apiUrl = import.meta.env.VITE_API_URL;
    // Remove o sufixo /api se presente para evitar duplicação na URL do SSE
    const baseUrl = apiUrl.endsWith('/api') ? apiUrl.slice(0, -4) : apiUrl;
    const eventSource = new EventSource(`${baseUrl}/api/automation/feed?token=${token}`);

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as AutomationFeedItem;
        setFeed((prev) => {
          // Adiciona novo evento no início e limita a 10 itens
          const updated = [data, ...prev].slice(0, 10);
          return updated;
        });
      } catch (error) {
        console.warn('Failed to parse SSE message:', error);
      }
    };

    const handleOpen = () => setIsConnected(true);
    const handleError = () => {
      setIsConnected(false);
      console.warn('SSE connection error, will retry automatically');
    };

    eventSource.addEventListener('message', handleMessage);
    eventSource.addEventListener('open', handleOpen);
    eventSource.addEventListener('error', handleError);

    // Fecha a conexão SSE ao desmontar o componente
    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, []);

  return { feed, isConnected };
}