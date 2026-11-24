// Legacy component fixtures expose their streams through mocked fetch. Route the
// WebSocket adapter contract to those fixtures; transport itself is tested separately.
import { vi } from 'vitest';
import { chatRequest } from './chat-request';

vi.mock('./chat-websocket', () => ({
  chatWebSocket: ({path, body}: {path: string; body: Record<string, unknown>}) =>
    chatRequest(path, {method:'POST', body:JSON.stringify(body)}),
}));
