import type { PlannerOutput, SchedulerOutput } from './types.js';

export async function schedulerAgent(planner: PlannerOutput): Promise<SchedulerOutput> {
  return { scheduled: planner.posts.map(p => ({ dayIndex: p.dayIndex, platform: p.platform })), approvalStatus: 'pending' };
}
