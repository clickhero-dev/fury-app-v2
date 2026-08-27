import { Router } from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { getRedisConnection } from "../lib/queue.js";
import { Queue } from "bullmq";

const router = Router();

// Nomes das filas conhecidas no projeto
const KNOWN_QUEUES = [
  'studio-generate-image',
  'studio-compliance-check',
  'rule-engine',
  'fury-engine',
  'publish-due',
];

let bullBoardRouter: ReturnType<ExpressAdapter['getRouter']> | null = null;

async function initializeBullBoard() {
  const connection = await getRedisConnection();
  
  const queues = KNOWN_QUEUES.map(name => 
    new BullMQAdapter(new Queue(name, { connection }))
  );

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues,
    serverAdapter,
  });

  bullBoardRouter = serverAdapter.getRouter();
  return bullBoardRouter;
}

// Inicialização preguiçosa
let initPromise: Promise<ReturnType<ExpressAdapter['getRouter']>> | null = null;

router.use('/admin/queues', async (req, res, next) => {
  if (!initPromise) {
    initPromise = initializeBullBoard();
  }
  try {
    const r = await initPromise;
    r(req, res, next);
  } catch (err) {
    next(err);
  }
});

export default router;