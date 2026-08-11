import { contextAgent } from './context.agent.js';
import { researchAgent } from './research.agent.js';
import { analyticsAgent } from './analytics.agent.js';
import { strategyAgent } from './strategy.agent.js';
import { plannerAgent } from './planner.agent.js';
import { copywriterAgent } from './copywriter.agent.js';
import { creativeAgent } from './creative.agent.js';
import { qualityAgent } from './quality.agent.js';
import { schedulerAgent } from './scheduler.agent.js';
import { brandingAgent } from './branding.agent.js';
import { savePlanToDb, savePlanToDbInput } from './save.service.js';
import type { AgentStep } from './types.js';

export const jobs = new Map<string, {
  id: string;
  tenantId: string;
  status: 'pending' | 'running' | 'generating' | 'done' | 'error';
  currentAgent: string;
  agentProgress: AgentStep[];
  planId?: string;
  error?: string;
}>();

export function generateId(): string {
  return crypto.randomUUID();
}

export async function runPipeline(tenantId: string, jobId: string, postCount = 16): Promise<void> {
  const update = (name: string, status: AgentStep['status'], pct: number) => {
    const job = jobs.get(jobId);
    if (!job) return;
    job.currentAgent = name;
    job.status = 'generating';
    const existing = job.agentProgress.find(s => s.name === name);
    if (existing) {
      existing.status = status;
      existing.pct = pct;
    } else {
      job.agentProgress.push({ name, status, pct });
    }
  };

  const fail = (err: unknown) => {
    const j = jobs.get(jobId);
    if (j) {
      j.status = 'error';
      j.error = err instanceof Error ? err.message : 'Erro interno';
    }
  };

  try {
    update('Context Agent', 'running', 10);
    const ctx = await contextAgent(tenantId);
    update('Context Agent', 'completed', 15);

    update('Research Agent', 'running', 20);
    const research = await researchAgent(ctx);
    update('Research Agent', 'completed', 25);

    update('Analytics Agent', 'running', 30);
    const analytics = await analyticsAgent(ctx);
    update('Analytics Agent', 'completed', 35);

    update('Strategy Agent', 'running', 40);
    const strategy = await strategyAgent(ctx, research, analytics);
    update('Strategy Agent', 'completed', 45);

    update('Planner Agent', 'running', 50);
    const planner = await plannerAgent(ctx, research, strategy, postCount);
    update('Planner Agent', 'completed', 55);

    update('Copywriter Agent', 'running', 60);
    let copywriter = await copywriterAgent(ctx, planner);
    update('Copywriter Agent', 'completed', 65);

    update('Creative Agent', 'running', 70);
    const creative = await creativeAgent(ctx, planner);
    update('Creative Agent', 'completed', 75);

    update('Quality Agent', 'running', 80);
    let quality = await qualityAgent(planner, copywriter);
    update('Quality Agent', 'completed', 85);

    if (!quality.passed) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        update('Copywriter Agent', 'running', 60);
        copywriter = await copywriterAgent(ctx, planner);
        update('Copywriter Agent', 'completed', 65);

        update('Quality Agent', 'running', 80);
        quality = await qualityAgent(planner, copywriter);
        update('Quality Agent', 'completed', 85);

        if (quality.passed) break;
        if (attempt === 2) {
          fail(new Error(
            'Qualidade não passou após 2 tentativas: ' +
            quality.checks.filter(c => !c.passed).map(c => c.message).join(', '),
          ));
          return;
        }
      }
    }

    update('Scheduler Agent', 'running', 90);
    const scheduler = await schedulerAgent(planner);
    update('Scheduler Agent', 'completed', 93);

    update('Branding Agent', 'running', 95);
    const branding = await brandingAgent(ctx, planner, copywriter, creative);
    update('Branding Agent', 'completed', 98);

    if (!branding.approved) {
      fail(new Error('Compliance rejeitou: ' + (branding.notes ?? '—')));
      return;
    }

    const planId = await savePlanToDb({
      tenantId, context: ctx, research, analytics, strategy,
      planner, copywriter, creative, quality, scheduler, branding,
    } satisfies savePlanToDbInput);

    update('Pipeline concluído', 'completed', 100);
    const job = jobs.get(jobId);
    if (job) {
      job.planId = planId;
      job.status = 'done';
    }
  } catch (err: unknown) {
    fail(err);
  }
}
