import type { EventApi, EventDropArg, EventInput } from '@fullcalendar/core';
import type { Post } from '../types';

export function postToEvent(post: Post & { calendarDate?: string }): EventInput {
  const channelMap: Record<string, string> = {
    'instagram': 'instagram',
    'facebook': 'facebook',
    'tiktok': 'tiktok',
    'whatsapp': 'whatsapp',
    'google': 'google',
    'meta': 'meta',
    'linkedin': 'linkedin',
    'youtube': 'youtube',
  };

  const normalizedChannel = channelMap[post.platform?.toLowerCase() || ''] || post.platform;

  const statusMap: Record<string, 'draft' | 'scheduled' | 'published' | 'failed'> = {
    'rascunho': 'draft',
    'draft': 'draft',
    'agendado': 'scheduled',
    'scheduled': 'scheduled',
    'publicado': 'published',
    'published': 'published',
    'erro': 'failed',
    'failed': 'failed',
  };

  const normalizedStatus = statusMap[post.status?.toLowerCase() || ''] || 'draft';

  // Obtém a data simples (YYYY-MM-DD)
  const activeDate = (post.calendarDate || (post as any).date || post.scheduledAt || '').split('T')[0];

  // Extrai a hora exatamente como gravada (HH:mm:ss) sem interpretar UTC
  let timePart = (post as any).time || '00:00:00';
  if (post.scheduledAt && post.scheduledAt.includes('T')) {
    timePart = post.scheduledAt.split('T')[1].slice(0, 8);
  }

  // Cria a data local ISO para o FullCalendar
  const startDate = activeDate ? `${activeDate}T${timePart}` : post.scheduledAt;

  return {
    id: post.id,
    title: post.title || post.caption?.slice(0, 40) || 'Sem título',
    start: startDate, 
    allDay: false,
    extendedProps: {
      post,
      channel: normalizedChannel,
      status: normalizedStatus,
      scheduledAt: post.scheduledAt || null,
      postType: post.postType || null,
    },
  };
}

export function extractEventDropData(event: EventDropArg['event']): { 
  postId: string; 
  newDate: string; 
  scheduledAt: string | null;
} {
  const dateOnly = event.startStr ? event.startStr.split('T')[0] : '';

  let scheduledAt: string | null = null;

  if (event.start) {
    const hours = String(event.start.getHours()).padStart(2, '0');
    const minutes = String(event.start.getMinutes()).padStart(2, '0');
    const seconds = String(event.start.getSeconds()).padStart(2, '0');

    // Monta a string no horário local exato da grade com final .000Z
    // Isso passa pela validação do Zod sem disparar o cálculo de fuso -03:00
    scheduledAt = `${dateOnly}T${hours}:${minutes}:${seconds}.000Z`;
  }

  return {
    postId: event.id,
    newDate: dateOnly,
    scheduledAt,
  };
}

export function getPostFromEvent(event: EventApi): Post | undefined {
  return event.extendedProps?.post;
}