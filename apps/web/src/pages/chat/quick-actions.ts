import { CalendarDays, Image, Megaphone, Video, Sparkles } from 'lucide-react';

export const quickActions = [
  { label: 'Criar post para o Instagram', question: 'Qual é o tema do post e para qual público?', prompt: 'Quero criar um post para o Instagram.', icon: Image },
  { label: 'Agendar posts da semana', question: 'Qual semana e quais conteúdos você quer agendar?', prompt: 'Quero agendar os posts da semana. Confirme datas, horários e fuso antes de propor agendamentos.', icon: CalendarDays },
  { label: 'Criar Reels para o Instagram', question: 'Qual é o tema e o objetivo do Reels?', prompt: 'Quero criar um Reels para o Instagram em formato vertical.', icon: Video },
  { label: 'Criar vídeo para o negócio', question: 'O que seu vídeo deve apresentar sobre o negócio?', prompt: 'Quero criar um vídeo para meu negócio. Ofereça a opção de publicar no Instagram somente após revisar o vídeo.', icon: Video },
  { label: 'Aumentar seguidores no Instagram', question: 'Qual perfil você quer divulgar e qual público deseja alcançar?', prompt: 'Quero criar uma campanha para aumentar seguidores no Instagram. Verifique os objetivos suportados e explique limitações; não prometa seguidores.', icon: Megaphone },
  { label: 'Atrair clientes pelo WhatsApp', question: 'Qual oferta e qual público você quer atrair pelo WhatsApp?', prompt: 'Quero criar uma campanha para atrair novos clientes pelo WhatsApp. Confirme o número e os recursos conectados necessários.', icon: Megaphone },
] as const;
export const homeActions = [
  { id: 'orientacao', label: 'Não sei por onde começar', benefit: 'Encontre um próximo passo simples para seu negócio.', question: 'O que você mais precisa para seu negócio agora?', prompt: 'Quero uma recomendação simples de próximo passo para meu negócio. Explique o benefício sem jargão e ajude a iniciar a ação escolhida.', icon: Sparkles },
  { id: 'conteudo', label: 'Criar conteúdo para minhas redes', benefit: 'Transforme uma ideia em post, imagem ou vídeo com ajuda da Ady.', question: 'O que você quer criar para suas redes?', prompt: 'Quero criar conteúdo para minhas redes. Guie a escolha de post, imagem ou vídeo/Reels e a criação com as ferramentas existentes.', icon: Image },
  { id: 'semana', label: 'Planejar minha semana', benefit: 'Organize ideias de publicações e prepare sua semana.', question: 'Qual é o foco das publicações desta semana?', prompt: 'Quero planejar as publicações da minha semana. Sugira ideias mesmo que eu ainda não tenha posts prontos e inicie o planejamento. Confirme datas, horários e fuso antes de propor agendamentos.', icon: CalendarDays },
  { id: 'clientes', label: 'Atrair mais clientes', benefit: 'Prepare uma campanha guiada para divulgar seu negócio.', question: 'O que você quer divulgar para atrair clientes?', prompt: 'Quero preparar uma campanha guiada para atrair mais clientes. Explique as escolhas em linguagem simples e verifique os objetivos suportados. Não presuma canal, orçamento ou integração nem prometa resultados.', icon: Megaphone },
] as const;
export function homeActionForId(id: string | null) {
  return homeActions.find(action => action.id === id) ?? null;
}

const safeguards = 'Continue este fluxo guiado em linguagem simples, explicando o benefício para o negócio, com uma pergunta por vez e sugestões clicáveis quando houver alternativas previsíveis. Use contexto confiável já disponível para evitar perguntas repetidas; não invente dados. Solicite campos faltantes, conta conectada, permissões e orçamento quando aplicável. Sem integração ou permissão, explique como conectar e não simule sucesso. Reutilize as ferramentas existentes e apresente revisão e confirmação explícita antes de gerar com custo, agendar, publicar ou criar campanha. Esta solicitação não autoriza executar essas ações.';

export type QuickAction = (typeof quickActions)[number] | (typeof homeActions)[number];
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
    case 'Não sei por onde começar': return ['Ter ideias do que publicar', 'Organizar minhas publicações', 'Divulgar meu negócio'];
    case 'Criar conteúdo para minhas redes': return ['Criar um post com imagem', 'Criar um vídeo ou Reels', 'Preciso de uma ideia para publicar'];
    case 'Planejar minha semana': return [`Apresentar ${business} para mais pessoas`, 'Compartilhar dicas úteis', 'Divulgar produtos ou serviços'];
    case 'Atrair mais clientes': return ['Um produto', 'Um serviço', 'Quero ajuda para escolher o que divulgar'];
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
