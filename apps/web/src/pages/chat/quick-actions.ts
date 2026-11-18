import { CalendarDays, Image, Megaphone, Video } from 'lucide-react';

export const quickActions = [
  { label: 'Criar post para o Instagram', question: 'Qual é o tema do post e para qual público?', prompt: 'Quero criar um post para o Instagram.', icon: Image },
  { label: 'Agendar posts da semana', question: 'Qual semana e quais conteúdos você quer agendar?', prompt: 'Quero agendar os posts da semana. Confirme datas, horários e fuso antes de propor agendamentos.', icon: CalendarDays },
  { label: 'Criar Reels para o Instagram', question: 'Qual é o tema e o objetivo do Reels?', prompt: 'Quero criar um Reels para o Instagram em formato vertical.', icon: Video },
  { label: 'Criar vídeo para o negócio', question: 'O que seu vídeo deve apresentar sobre o negócio?', prompt: 'Quero criar um vídeo para meu negócio. Ofereça a opção de publicar no Instagram somente após revisar o vídeo.', icon: Video },
  { label: 'Aumentar seguidores no Instagram', question: 'Qual perfil você quer divulgar e qual público deseja alcançar?', prompt: 'Quero criar uma campanha para aumentar seguidores no Instagram. Verifique os objetivos suportados e explique limitações; não prometa seguidores.', icon: Megaphone },
  { label: 'Atrair clientes pelo WhatsApp', question: 'Qual oferta e qual público você quer atrair pelo WhatsApp?', prompt: 'Quero criar uma campanha para atrair novos clientes pelo WhatsApp. Confirme o número e os recursos conectados necessários.', icon: Megaphone },
] as const;
const safeguards = 'Continue este fluxo guiado com uma pergunta por vez. Solicite campos faltantes, conta conectada, permissões e orçamento quando aplicável. Sem integração ou permissão, explique como conectar e não simule sucesso. Reutilize as ferramentas existentes e apresente revisão e confirmação explícita antes de gerar com custo, agendar, publicar ou criar campanha. Esta solicitação não autoriza executar essas ações.';

export type QuickAction = (typeof quickActions)[number];
export type QuickActionContext = { tenantName?: string; city?: string; businessContext?: string };
function text(value: unknown, limit: number): string | undefined {
  return typeof value === 'string' ? value.replace(/[\s\p{Cc}]+/gu, ' ').trim().slice(0, limit) || undefined : undefined;
}
export function normalizeQuickActionContext(value: unknown): QuickActionContext {
  if (!value || typeof value !== 'object') return {};
  const data = value as Record<string, unknown>;
  const audience = data.audienceDefaults && typeof data.audienceDefaults === 'object' ? data.audienceDefaults as Record<string, unknown> : {};
  const entries = {tenantName:text(data.tenantName, 80), city:text(audience.city, 60), businessContext:text(data.businessContext, 1200)};
  return Object.fromEntries(Object.entries(entries).filter(([,value]) => value !== undefined));
}
export function quickActionSuggestions(action: QuickAction, context: QuickActionContext): string[] {
  const business = context.tenantName || 'meu negócio';
  const place = context.city ? ` em ${context.city}` : '';
  switch (action.label) {
    case 'Criar post para o Instagram': return [`Apresentar ${business}${place}`, 'Compartilhar dicas para meu público', 'Destacar um produto ou serviço'];
    case 'Agendar posts da semana': return ['Planejar uma semana de dicas educativas', `Planejar posts de apresentação de ${business}`, 'Planejar posts sobre produtos e serviços'];
    case 'Criar Reels para o Instagram': return [`Apresentar ${business} para atrair clientes${place}`, 'Compartilhar dicas para engajar meu público', `Mostrar bastidores de ${business} para aproximar o público`];
    case 'Criar vídeo para o negócio': return [`Apresentar ${business} em vídeo`, 'Demonstrar um produto ou serviço em vídeo', `Mostrar os bastidores de ${business}`];
    case 'Aumentar seguidores no Instagram': return [`Divulgar o perfil de ${business}${place}`, 'Explorar conteúdo educativo para alcançar meu público', 'Explorar bastidores para alcançar pessoas interessadas'];
    case 'Atrair clientes pelo WhatsApp': return [`Planejar a divulgação de um produto ou serviço${place}`, 'Responder dúvidas antes do contato pelo WhatsApp', `Apresentar ${business} para novos contatos`];
  }
}
export function buildQuickActionPrompt(action: QuickAction, answer: string, context: QuickActionContext): string {
  if (!answer.trim()) return '';
  const known = [context.tenantName && `Negócio: ${context.tenantName}`, context.city && `Cidade: ${context.city}`, context.businessContext && `Contexto informado: ${context.businessContext}`].filter(Boolean);
  return [action.prompt, action.question, answer.trim(), ...known, safeguards].join('\n');
}
