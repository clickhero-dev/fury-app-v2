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
    'publicando…': 'scheduled',
    'publishing': 'scheduled', // claim em andamento ≠ publicado
    'publicado': 'published',
    'published': 'published',
    'erro': 'failed',
    'failed': 'failed',
  };

  const normalizedStatus = statusMap[post.status?.toLowerCase() || ''] || 'draft';

  // scheduledAt é um instante UTC real (o job publica nele): o FullCalendar
  // converte para o horário local. Sem horário, fica no dia do calendário.
  const activeDate = (post.calendarDate || (post as any).date || '').split('T')[0];
  const startDate = post.scheduledAt || (activeDate ? `${activeDate}T00:00:00` : undefined);

  return {
    id: post.id,
    title: post.title || post.caption?.slice(0, 40) || 'Sem título',
    start: startDate, 
    allDay: false,
    // publicado/publicando não arrasta
    startEditable: normalizedStatus !== 'published' && post.status !== 'publishing',
    extendedProps: {
      post,
      channel: normalizedChannel,
      status: normalizedStatus,
      scheduledAt: post.scheduledAt || null,
      postType: post.postType || null,
      // ordenação do dia: não publicados primeiro (eventOrder)
      publishedRank: normalizedStatus === 'published' ? 1 : 0,
    },
  };
}

export function extractEventDropData(event: EventDropArg['event']): { 
  postId: string; 
  newDate: string; 
  scheduledAt: string | null;
} {
  // Dia local onde foi solto + instante UTC real (mesma hora exibida na grade)
  const dateOnly = event.start ? localYMD(event.start) : '';
  const scheduledAt = event.start ? event.start.toISOString() : null;

  return {
    postId: event.id,
    newDate: dateOnly,
    scheduledAt,
  };
}

/** YYYY-MM-DD no fuso local (toISOString usaria UTC). */
export function localYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getPostFromEvent(event: EventApi): Post | undefined {
  return event.extendedProps?.post;
}

export type EventClickAction = 'open-detail' | 'toggle-selection';

/**
 * Decide o comportamento de um clique em um evento do calendário.
 *
 * - Clique normal  -> abre o painel de detalhes do post (modal lateral).
 * - Ctrl/Cmd+Clique -> alterna a multisseleção, exibindo a barra de ações
 *   em lote (Agendar/Desprogramar/Excluir).
 *
 * Extraído como função pura para ser testável isoladamente.
 */
export function resolveEventClickAction(isModifierClick: boolean): EventClickAction {
  return isModifierClick ? 'toggle-selection' : 'open-detail';
}