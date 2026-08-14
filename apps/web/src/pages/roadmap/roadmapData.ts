/**
 * Roadmap do Ady — dados da linha do tempo.
 *
 * Mantido em linguagem simples (não-técnica) para que qualquer pessoa,
 * inclusive usuários finais, entenda a evolução e o futuro da ferramenta.
 *
 * Editar apenas a lista abaixo — o layout se adapta sozinho.
 */

export type MilestoneStatus = 'done' | 'active' | 'planned';

export interface Milestone {
  /** Período exibido no cabeçalho (ex: "Abr 2026"). */
  period: string;
  /** Título curto do capítulo/marco. */
  title: string;
  /** Frase em linguagem simples do que você ganha. */
  summary: string;
  /** Fala fictícia que traduz a entrega. */
  quote?: string;
  /** Lista de ganhos práticos para o usuário. */
  gains: string[];
  /** Estado do marco. */
  status: MilestoneStatus;
  /** Marca o capítulo mais recente / momento atual. */
  current?: boolean;
}

export const roadmap: Milestone[] = [
  {
    period: 'Abr 2026',
    title: 'O começo',
    status: 'done',
    summary:
      'O primeiro passo: criar sua conta com segurança e conectar suas redes sociais para começar a acompanhar seus números.',
    gains: [
      'Conta própria, segura e simples de criar',
      'Conexão com suas redes sociais em poucos passos',
      'Primeiro painel para ver o desempenho do seu negócio',
    ],
    quote: 'Eu crio minha conta, conecto minhas redes e pronto — já estou dentro.',
  },
  {
    period: 'Mai 2026',
    title: 'A IA chega para criar',
    status: 'done',
    summary:
      'Ensinamos o Ady a criar conteúdo inteligente, para você economizar tempo e não depender de ninguém.',
    gains: [
      'Textos prontos para postagens e anúncios, gerados por IA',
      'Imagens criadas do zero, sem precisar de designer',
      'Regras de desempenho que agem quando algo não vai bem',
      'Planos e assinaturas para escolher o que cabe no seu bolso',
    ],
    quote: 'Em vez de horas pensando no que postar, peço para o Ady e ele cria.',
  },
  {
    period: 'Jun 2026',
    title: 'Campanhas de verdade',
    status: 'done',
    summary:
      'O Ady deixou de ser só criação e virou uma ferramenta de gestão completa para o seu negócio.',
    gains: [
      'Criar campanhas em poucos cliques, até pelo WhatsApp',
      'Ver com clareza o que está funcionando, com gráficos simples',
      'Sua identidade visual (logo, cores e tom de voz) aplicada em tudo',
      'Um painel bonito com tudo em um só lugar',
    ],
    quote: 'Agora vejo claramente o que dá resultado — e o visual é do meu jeito.',
  },
  {
    period: 'Jul 2026',
    title: 'O Ady que trabalha sozinho',
    status: 'done',
    summary:
      'O Ady aprendeu a planejar e executar por conta própria, cuidando do conteúdo do início ao fim.',
    gains: [
      'Planejador que monta o calendário inteiro do seu conteúdo',
      'Gestão completa para quem vende para várias marcas ou clientes',
      'Painel de controle total para donos de negócio',
      'Um aviso claro caso seu plano esteja ativo ou vencido',
    ],
    quote: 'Eu defino o que quero e o Ady monta meu mês de conteúdo.',
  },
  {
    period: 'Ago 2026',
    title: 'Publicar sozinho + cara nova',
    status: 'active',
    current: true,
    summary:
      'O Ady aprendeu a publicar no lugar certo e ganhou uma identidade nova: o Ady moderno, escuro e elegante.',
    gains: [
      'Agendar e publicar automaticamente no Instagram',
      'Nova cara do produto, agora com o nome Ady de vez',
      'Visual moderno e consistente em toda a plataforma',
    ],
    quote: 'Eu só aprovo — o Ady agenda e publica por mim.',
  },
  {
    period: 'Set 2026',
    title: 'O Ady chega ao Google',
    status: 'planned',
    summary:
      'O Ady vai além do Instagram e te coloca também no Google, para muito mais gente encontrar você.',
    gains: [
      'Criar anúncios no Google direto pelo Ady',
      'Aparecer na pesquisa quando alguém procurar o seu negócio',
      'Mais pontos de contato: Instagram e agora Google',
    ],
    quote: 'Não é só mais um canal — é o cliente me achar na hora em que procura.',
  },
  {
    period: 'Out 2026',
    title: 'O Ady no WhatsApp',
    status: 'planned',
    summary:
      'O Ady vira um parceiro que você conversa: pede qualquer coisa pelo WhatsApp e ele resolve.',
    gains: [
      'Pedir textos, criativos e agendar campanhas por conversa',
      'Acesso a todas as funções do Ady pelo chat, sem navegar nas telas',
      'Um atendimento que funciona como a gente: você pede, ele entende e faz',
    ],
    quote: 'Em vez de mexer em cada botão, mando mensagem no WhatsApp e o Ady resolve.',
  },
  {
    period: 'Nov 2026',
    title: 'O Ady passa a te conhecer',
    status: 'planned',
    summary:
      'O Ady estuda o seu negócio para dar sugestões cada vez melhores e mais certeiras.',
    gains: [
      'Análise de tudo que você já postou para entender seu momento',
      'Estudo do seu negócio com base nos dados que já tem',
      'Sugestões de IA mais no seu contexto — e cada vez mais certas',
    ],
    quote: 'Quanto mais o Ady me conhece, mais ele acerta naquilo que sugere.',
  },
];

export const summaryCards = [
  {
    label: 'Já entregue',
    value: 5,
    status: 'done' as const,
    description: 'capítulos concluídos na trajetória do Ady',
  },
  {
    label: 'Em andamento',
    value: 1,
    status: 'active' as const,
    description: 'capítulo atual: publicar sozinho + cara nova',
  },
  {
    label: 'A caminho',
    value: 3,
    status: 'planned' as const,
    description: 'Google, WhatsApp e conhecer você melhor',
  },
];
