import { eq } from 'drizzle-orm';
import { db, campaignPlans, socialPosts } from '@fury/db';
import { contextAgent } from './context.agent.js';
import { researchAgent } from './research.agent.js';
import { analyticsAgent } from './analytics.agent.js';
import { strategyAgent } from './strategy.agent.js';
import { plannerAgent } from './planner.agent.js';
import { copywriterAgent } from './copywriter.agent.js';
import { creativeAgent } from './creative.agent.js';
import { imageGenerationAgent } from './image-generation.agent.js';
import { qualityAgent } from './quality.agent.js';
import { schedulerAgent } from './scheduler.agent.js';
import { brandingAgent } from './branding.agent.js';
import { savePlanToDb } from './save.service.js';
import { openrouterService } from '../services/llms/openrouter.service.js';
import type { WorkflowDefinition } from '../services/stateMachine/stageInterface.js';
import { RetryDependencyError } from '../services/stateMachine/workflow.engine.js';
import type { ArtifactMap } from '../services/stateMachine/types.js';

export function generateId(): string {
  return crypto.randomUUID();
}

/** Input inicial do workflow do planejador. */
export interface PlannerWorkflowInput {
  tenantId: string;
  currentDate: string; // ISO string - usado para calcular d+1 no planner
}

/** Leitura tipada de artefato. */
function artifact<T>(artifacts: ArtifactMap, key: string): T {
  return artifacts[key] as T;
}

const AGENTS = [
  'Prerequisites Agent',
  'Context Agent',
  'Research Agent',
  'Analytics Agent',
  'Strategy Agent',
  'Planner Agent',
  'Copywriter Agent',
  'Creative Agent',
  'Image Generation Agent',
  'Quality Agent',
  'Scheduler Agent',
  'Branding Agent',
];

export const PLANNER_AGENT_NAMES = AGENTS;

/**
 * Definição declarativa do workflow do planejador de IA.
 * Cada agente vira um stage com artifactKey, retryPolicy e rollback.
 */
export const plannerWorkflow: WorkflowDefinition<PlannerWorkflowInput> = {
  id: 'planner-generate',
  lockKey: (ctx) => ctx.tenantId,
  defaultRetry: { maxAttempts: 2, backoffMs: 1000, backoffType: 'exponential' },
  stages: [
    {
      id: 'prerequisites',
      deps: [],
      artifactKey: 'prerequisites',
      // Falha rápido: saldo é cacheado internamente; sem créditos, o front
      // recebe o estado de erro do job sem gastar LLM em nenhuma etapa.
      retryPolicy: { maxAttempts: 1, backoffMs: 0, backoffType: 'fixed' },
      execute: async () => {
        await openrouterService.assertCreditsAvailable();
        return true;
      },
    },
    {
      id: 'context',
      artifactKey: 'context',
      execute: (ctx) => contextAgent(ctx.tenantId),
    },
    {
      id: 'research',
      deps: ['context'],
      artifactKey: 'research',
      execute: (_ctx, artifacts) => researchAgent(artifact(artifacts, 'context')),
    },
    {
      id: 'analytics',
      deps: ['context'],
      artifactKey: 'analytics',
      execute: (_ctx, artifacts) => analyticsAgent(artifact(artifacts, 'context')),
    },
    {
      id: 'strategy',
      deps: ['research', 'analytics'],
      artifactKey: 'strategy',
      execute: (_ctx, artifacts) => strategyAgent(
        artifact(artifacts, 'context'),
        artifact(artifacts, 'research'),
        artifact(artifacts, 'analytics'),
      ),
    },
    {
      id: 'planner',
      deps: ['research', 'strategy'],
      artifactKey: 'planner',
      retryPolicy: { maxAttempts: 3, backoffMs: 1000, backoffType: 'exponential' },
      execute: (ctx, artifacts) => plannerAgent(
        artifact(artifacts, 'context'),
        artifact(artifacts, 'research'),
        artifact(artifacts, 'strategy'),
        ctx.currentDate, // Pass currentDate for d+1 logic
      ),
    },
    {
      id: 'copywriter',
      deps: ['planner'],
      artifactKey: 'copywriter',
      retryPolicy: { maxAttempts: 3, backoffMs: 800, backoffType: 'exponential' },
      execute: (_ctx, artifacts) => copywriterAgent(
        artifact(artifacts, 'context'),
        artifact(artifacts, 'planner'),
      ),
    },
    {
      id: 'creative',
      deps: ['planner'],
      artifactKey: 'creative',
      execute: (_ctx, artifacts) => creativeAgent(
        artifact(artifacts, 'context'),
        artifact(artifacts, 'planner'),
      ),
    },
    {
      id: 'image-generation',
      deps: ['creative', 'planner'],
      artifactKey: 'images',
      retryPolicy: { maxAttempts: 3, backoffMs: 2000, backoffType: 'exponential' },
      execute: async (_ctx, artifacts) => imageGenerationAgent(
        artifact(artifacts, 'context'),
        artifact(artifacts, 'creative'),
        artifact(artifacts, 'planner'),
      ),
      rollback: async (_ctx, artifacts) => {
        const images = artifacts.images as { posts: { imageUrl: string }[] } | undefined;
        if (images?.posts) {
          const { deleteGeneratedImages } = await import('../lib/image-validation.js');
          await deleteGeneratedImages(images.posts.map(p => p.imageUrl));
        }
      },
    },
    {
      id: 'quality',
      deps: ['planner', 'copywriter'],
      artifactKey: 'quality',
      retryPolicy: { maxAttempts: 2, backoffMs: 500, backoffType: 'fixed' },
      execute: async (_ctx, artifacts) => {
        const quality = await qualityAgent(
          artifact(artifacts, 'planner'),
          artifact(artifacts, 'copywriter'),
        );
        if (!quality.passed) {
          const reasons = quality.checks.filter((c) => !c.passed).map((c) => c.message).join(', ');
          throw new RetryDependencyError('copywriter', `Qualidade não passou: ${reasons}`);
        }
        return quality;
      },
    },
    {
      id: 'scheduler',
      deps: ['planner'],
      artifactKey: 'scheduler',
      execute: (_ctx, artifacts) => schedulerAgent(artifact(artifacts, 'planner')),
    },
    {
      id: 'branding',
      deps: ['planner', 'copywriter', 'creative'],
      artifactKey: 'branding',
      execute: async (_ctx, artifacts) => {
        const branding = await brandingAgent(
          artifact(artifacts, 'context'),
          artifact(artifacts, 'planner'),
          artifact(artifacts, 'copywriter'),
          artifact(artifacts, 'creative'),
        );
        if (!branding.approved) {
          throw new Error('Compliance rejeitou: ' + (branding.notes ?? '—'));
        }
        return branding;
      },
    },
    {
      id: 'save',
      deps: ['context', 'research', 'analytics', 'strategy', 'planner', 'copywriter', 'creative', 'image-generation', 'quality', 'scheduler', 'branding'],
      artifactKey: 'planId',
      execute: (ctx, artifacts) => savePlanToDb({
        tenantId: ctx.tenantId,
        context: artifact(artifacts, 'context'),
        research: artifact(artifacts, 'research'),
        analytics: artifact(artifacts, 'analytics'),
        strategy: artifact(artifacts, 'strategy'),
        planner: artifact(artifacts, 'planner'),
        copywriter: artifact(artifacts, 'copywriter'),
        creative: artifact(artifacts, 'creative'),
        images: artifact(artifacts, 'images'),
        quality: artifact(artifacts, 'quality'),
        scheduler: artifact(artifacts, 'scheduler'),
        branding: artifact(artifacts, 'branding'),
      }),
      rollback: async (ctx, artifacts) => {
        const planId = artifacts.planId as string | undefined;
        if (planId) {
          await db.delete(socialPosts).where(eq(socialPosts.planId, planId));
          await db.delete(campaignPlans).where(eq(campaignPlans.id, planId));
        }
        void ctx;
      },
    },
  ],
  finalize: (_ctx, artifacts) => ({
    planId: typeof artifacts.planId === 'string' ? artifacts.planId : undefined,
  }),
};