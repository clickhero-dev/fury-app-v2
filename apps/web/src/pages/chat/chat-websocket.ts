import { ChatRequestError, chatRequest } from './chat-request';

type ChatSocketPayload = { path: string; body: Record<string, unknown> };

/** Adapt socket events to the existing streaming consumer; never replay an action. */
export async function chatWebSocket(payload: ChatSocketPayload): Promise<Response> {
  const url = new URL(import.meta.env.VITE_CHAT_WS_URL);
  const localDev = import.meta.env.DEV && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!(url.protocol === 'wss:' || (url.protocol === 'ws:' && localDev)) || url.pathname !== '/ws' || url.search || url.hash || url.username || url.password) throw new Error('URL WebSocket inválida');
  const ticketController = new AbortController();
  let ticketTimeout: ReturnType<typeof setTimeout> | undefined;
  const ticketData: unknown = await Promise.race([
    chatRequest('/websocket-ticket', {method:'POST', body:'{}', signal:ticketController.signal}).then(response => response.json()),
    new Promise<never>((_, reject) => { ticketTimeout = setTimeout(() => { ticketController.abort(); reject(new Error('Tempo esgotado ao solicitar ticket')); }, 15_000); }),
  ]).finally(() => clearTimeout(ticketTimeout));
  if (!ticketData || typeof ticketData !== 'object' || !('ticket' in ticketData) || typeof ticketData.ticket !== 'string' || !ticketData.ticket) throw new Error('Ticket WebSocket inválido');
  const ticket = ticketData.ticket;
  return new Promise((resolve, reject) => {
    let accepted = false;
    let finished = false;
    let terminal = false;
    let controller: ReadableStreamDefaultController<Uint8Array>;
    let timeout: ReturnType<typeof setTimeout>;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(value) { controller = value; },
      cancel() { finished = true; clearTimeout(timeout); socket.close(); },
    });
    let socket: WebSocket;
    try { socket = new WebSocket(url.toString()); } catch (error) { reject(error); return; }
    const fail = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (accepted) controller.error(new Error('Conexão WebSocket interrompida'));
      else reject(new Error('Conexão WebSocket interrompida'));
      socket.close();
    };
    const watch = (delay: number) => { clearTimeout(timeout); timeout = setTimeout(fail, delay); };
    timeout = setTimeout(fail, 15_000);
    socket.onopen = () => {
      if (finished) return;
      try { socket.send(JSON.stringify({ticket, ...payload})); }
      catch { fail(); }
    };
    socket.onerror = fail;
    socket.onclose = fail;
    socket.onmessage = ({data}) => {
      if (finished) return;
      try {
        if (typeof data !== 'string') throw new Error('frame inválido');
        const frame: unknown = JSON.parse(data);
        if (!frame || typeof frame !== 'object' || !('event' in frame) || typeof frame.event !== 'string' || !/^[\w-]+$/.test(frame.event)) throw new Error('frame inválido');
        if (accepted) watch(45_000);
        if (frame.event === 'heartbeat' || frame.event === 'ping') return;
        if (!('data' in frame) || !frame.data || typeof frame.data !== 'object' || Array.isArray(frame.data)) throw new Error('frame inválido');
        if (!accepted) {
          if (frame.event === 'error') {
            const data = frame.data as Record<string, unknown>;
            finished = true;
            clearTimeout(timeout);
            reject(new ChatRequestError(typeof data.status === 'number' ? data.status : 500, null, typeof data.code === 'string' ? data.code : null));
            socket.close();
            return;
          }
          if (frame.event !== 'ack') throw new Error('ack ausente');
          accepted = true; watch(45_000); resolve(new Response(stream)); return;
        }
        if (frame.event === 'end') {
          if (!terminal) throw new Error('fim sem resultado');
          finished = true;
          clearTimeout(timeout);
          controller.close();
          socket.close();
          return;
        }
        controller.enqueue(encoder.encode(`event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`));
        if (frame.event === 'done' || frame.event === 'error') terminal = true;
      } catch { fail(); }
    };
  });
}
