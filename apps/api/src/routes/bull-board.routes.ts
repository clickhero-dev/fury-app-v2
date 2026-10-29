import { Router } from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { getRedisConnection } from "../lib/queue.js";
import { Queue } from "bullmq";
import type { QueueAdapterOptions } from "@bull-board/api/typings/app";
import { bullBoardAuthMiddleware } from "../middleware/bull-board-auth.middleware.js";
import { startBullBoardMetrics, stopBullBoardMetrics } from "../lib/bull-board-metrics.js";

const router = Router();

const QUEUE_PRESENTATION = [
  {
    name: 'billing-renewal',
    group: 'ady',
    displayName: 'Planos e créditos',
    description: 'Renova planos e processa os créditos previstos para cada assinatura.',
  },
  {
    name: 'budget-optimize',
    group: 'ady',
    displayName: 'Orçamento Ady',
    description: 'Avalia e aplica recomendações de orçamento para as contas de anúncios.',
  },
  {
    name: 'fury-engine',
    group: 'ady',
    displayName: 'Automações Ady',
    description: 'Avalia regras, automações e oportunidades de otimização da Ady.',
  },
  {
    name: 'google-sync',
    group: 'google',
    displayName: 'Perfis Google',
    description: 'Sincroniza os dados dos perfis comerciais conectados ao Google.',
  },
  {
    name: 'lead-status',
    group: 'meta',
    displayName: 'Leads Meta',
    description: 'Marca como não contatados os leads novos que passaram do prazo.',
  },
  {
    name: 'meta-initial-sync',
    group: 'meta',
    displayName: 'Ativos Meta: inicial',
    description: 'Importa páginas, contas e outros ativos Meta após a conexão OAuth.',
  },
  {
    name: 'meta-sync',
    group: 'meta',
    displayName: 'Dados da conta Meta',
    description: 'Sincroniza dados das contas de anúncios Meta, incluindo campanhas e métricas.',
  },
  {
    name: 'planner-generate',
    group: 'planner',
    displayName: 'Plano de conteúdo',
    description: 'Gera planos e publicações de conteúdo para um tenant.',
  },
  {
    name: 'publish-due',
    group: 'meta',
    displayName: 'Publicações Meta',
    description: 'Encontra e publica conteúdos cujo horário agendado chegou.',
  },
  {
    name: 'rule-engine',
    group: 'ady',
    displayName: 'Regras Ady',
    description: 'Processa as regras automáticas de campanhas e orçamento da Ady.',
  },
  {
    name: 'studio-compliance-sweeper',
    group: 'studio',
    displayName: 'Checks órfãos',
    description: 'Localiza análises de compliance órfãs e as recoloca na fila.',
  },
  {
    name: 'studio-compliance-check',
    group: 'studio',
    displayName: 'Compliance',
    description: 'Verifica se uma imagem atende às regras de compliance do estúdio.',
  },
  {
    name: 'studio-generate-image',
    group: 'studio',
    displayName: 'Imagens',
    description: 'Gera imagens de campanha solicitadas pelo estúdio.',
  },
  {
    name: 'studio-video',
    group: 'studio',
    displayName: 'Vídeos',
    description: 'Gera vídeos de campanha solicitados pelo estúdio.',
  },
];

let bullBoardRouter: ReturnType<ExpressAdapter['getRouter']> | null = null;

async function initializeBullBoard() {
  const connection = await getRedisConnection();
  
  const queues = QUEUE_PRESENTATION.map(({ name, group, displayName, description }) =>
    new BullMQAdapter(new Queue(name, { connection }), {
      prefix: `${group}.`,
      delimiter: '.',
      displayName,
      description,
      allowRetries: true,
      allowCompletedRetries: true,
    } as Partial<QueueAdapterOptions> & { allowCompletedRetries: boolean })
  );
  const historyProvider = startBullBoardMetrics(queues, connection);

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/api/admin/queues');

  createBullBoard({
    queues,
    serverAdapter,
    options: {
      uiConfig: {
        showMetrics: true,
        overview: { groupByDelimiter: true },
      },
      historyProvider,
    },
  });

  bullBoardRouter = serverAdapter.getRouter();
  return bullBoardRouter;
}

/** Initialize at server startup so metric history is collected even before someone opens the board. */
export async function initializeBullBoardRoutes() {
  if (!initPromise) initPromise = initializeBullBoard();
  return initPromise;
}

export function shutdownBullBoardMetrics(): void {
  stopBullBoardMetrics();
}

// Inicialização preguiçosa
let initPromise: Promise<ReturnType<ExpressAdapter['getRouter']>> | null = null;

router.use(bullBoardAuthMiddleware);

router.use(async (req, res, next) => {
  try {
    const r = await initializeBullBoardRoutes();
    r(req, res, next);
  } catch (err) {
    next(err);
  }
});

export default router;
