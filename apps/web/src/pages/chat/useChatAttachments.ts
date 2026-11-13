import { useCallback, useEffect, useRef, useState } from 'react';
import { chatRequest, mediaError } from './chat-request';
import { isAttachment, validateFiles, type Attachment } from './chat-media';

export type DraftAttachment = {
  key: string;
  file: File;
  previewUrl?: string;
  conversationId?: string;
  attachment?: Attachment;
  status: 'uploading' | 'ready' | 'failed' | 'removing';
  error?: string;
};

export function useChatAttachments(ensureConversation: () => Promise<string | null>) {
  const [items, setItems] = useState<DraftAttachment[]>([]);
  const [error, setError] = useState('');
  const live = useRef<DraftAttachment[]>([]);
  const generation = useRef(0);
  const requests = useRef(new Map<string, AbortController>());
  const conversation = useRef<Promise<string | null> | null>(null);
  const update = useCallback((change: (items: DraftAttachment[]) => DraftAttachment[]) => {
    live.current = change(live.current);
    setItems(live.current);
  }, []);
  const dispose = useCallback(() => {
    generation.current++;
    requests.current.forEach(controller => controller.abort());
    requests.current.clear();
    live.current.forEach(item => { if (item.previewUrl) URL.revokeObjectURL(item.previewUrl); });
    live.current = [];
    conversation.current = null;
  }, []);
  const clear = useCallback(() => { dispose(); setItems([]); setError(''); }, [dispose]);
  useEffect(() => dispose, [dispose]);

  async function upload(key: string) {
    const item = live.current.find(item => item.key === key);
    if (!item || requests.current.has(key)) return;
    const version = generation.current;
    const controller = new AbortController();
    requests.current.set(key, controller);
    const current = () => generation.current === version && !controller.signal.aborted && live.current.some(item => item.key === key);
    update(items => items.map(item => item.key === key ? {...item,status:'uploading',error:undefined} : item));
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!conversation.current) conversation.current = ensureConversation();
      const id = item.conversationId || await conversation.current;
      if (!current()) return;
      if (!id) { conversation.current = null; throw new Error('conversation unavailable'); }
      update(items => items.map(item => item.key === key ? {...item,conversationId:id} : item));
      const body = new FormData();
      body.append('files',item.file);
      timeout = setTimeout(() => {
        if (!current()) return;
        controller.abort();
        update(items => items.map(item => item.key === key ? {...item,status:'failed',error:'O envio demorou demais. Tente novamente.'} : item));
      }, 120000);
      const data = await (await chatRequest(`/conversations/${id}/attachments`,{method:'POST',body,signal:controller.signal})).json();
      if (!current()) return;
      if (!Array.isArray(data.attachments) || data.attachments.length !== 1 || !isAttachment(data.attachments[0])) throw new Error('invalid attachment');
      const attachment: Attachment = data.attachments[0];
      if (live.current.some(other => other.key !== key && other.attachment?.id === attachment.id)) throw new Error('duplicate attachment');
      update(items => items.map(item => item.key === key ? {...item,status:'ready',attachment,error:undefined} : item));
    } catch (err) {
      if (current()) update(items => items.map(item => item.key === key ? {...item,status:'failed',error:mediaError(err,'upload')} : item));
    } finally {
      clearTimeout(timeout);
      if (requests.current.get(key) === controller) requests.current.delete(key);
    }
  }
  async function add(files: File[]) {
    if (!files.length) return;
    const validation = validateFiles(files,live.current.map(item => item.file));
    if (validation) { setError(validation); return; }
    setError('');
    const additions: DraftAttachment[] = files.map(file => ({key:crypto.randomUUID(), file, status:'uploading',
      previewUrl:file.type.startsWith('image/') || file.type.startsWith('video/') ? URL.createObjectURL(file) : undefined,
    }));
    // Reserve every slot synchronously, before the first await/creation.
    update(items => [...items,...additions]);
    await Promise.all(additions.map(item => upload(item.key)));
  }
  async function remove(key: string) {
    const item = live.current.find(item => item.key === key);
    if (!item || item.status === 'removing') return;
    if (!item.attachment) {
      requests.current.get(key)?.abort();
      requests.current.delete(key);
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      update(items => items.filter(item => item.key !== key));
      return;
    }
    const version = generation.current;
    const controller = new AbortController();
    requests.current.set(key,controller);
    update(items => items.map(item => item.key === key ? {...item,status:'removing',error:undefined} : item));
    const timeout = setTimeout(() => controller.abort(),30000);
    try {
      await chatRequest(`/conversations/${item.conversationId}/attachments/${item.attachment.id}`, {method:'DELETE',signal:controller.signal});
      if (version !== generation.current) return;
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      update(items => items.filter(item => item.key !== key));
    } catch (err) {
      if (version === generation.current) update(items => items.map(item => item.key === key ? {...item,status:'ready',error:mediaError(err,'remove')} : item));
    } finally {
      clearTimeout(timeout);
      if (requests.current.get(key) === controller) requests.current.delete(key);
    }
  }
  function retry(key: string) {
    if (live.current.find(item => item.key === key)?.status !== 'failed') return Promise.resolve();
    return upload(key);
  }
  return {items, error, add, remove, retry, clear,
    ready:items.filter(item => item.status === 'ready').map(item => item.attachment!),
    blocked:items.some(item => item.status !== 'ready'),
    isBlocked:() => live.current.some(item => item.status !== 'ready'),
  };
}
