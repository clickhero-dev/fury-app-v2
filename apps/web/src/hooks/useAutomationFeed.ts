import { useEffect, useState } from 'react';

export interface AutomationFeedItem {
  id: string;
  type: 'pause' | 'resume' | 'optimize' | 'scale';
  campaignName: string;
  message: string;
  timestamp: number;
}

export function useAutomationFeed() {
  const [feed, setFeed] = useState<AutomationFeedItem[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');

    if (!token) {
      console.warn('No token found, SSE feed disabled');
      return;
    }

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const eventSource = new EventSource(
      `${apiUrl}/api/automation/feed?token=${token}`
    );

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as AutomationFeedItem;
        setFeed((prev) => {
          const updated = [data, ...prev].slice(0, 10);
          return updated;
        });
      } catch (error) {
        console.warn('Failed to parse SSE message:', error);
      }
    };

    const handleOpen = () => {
      setIsConnected(true);
    };

    const handleError = () => {
      setIsConnected(false);
      console.warn('SSE connection error, will retry automatically');
    };

    eventSource.addEventListener('message', handleMessage);
    eventSource.addEventListener('open', handleOpen);
    eventSource.addEventListener('error', handleError);

    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, []);

  return { feed, isConnected };
}
