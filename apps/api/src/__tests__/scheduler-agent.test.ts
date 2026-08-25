import { describe, it, expect } from 'vitest';
import { schedulerAgent } from '../agents/scheduler.agent.js';
import type { PlannerOutput } from '../agents/types.js';

const planner: PlannerOutput = {
  totalPosts: 2,
  summary: { reelsCount: 1, carouselCount: 0, imageCount: 1, storiesCount: 0 },
  posts: [
    { dayIndex: 3, postType: 'reel', platform: 'instagram', title: 'A', contentPillar: 'Produto', category: 'engagement' },
    { dayIndex: 4, postType: 'image', platform: 'both', title: 'B', contentPillar: 'Produto', category: 'educational' },
  ],
};

describe('schedulerAgent', () => {
  it('mapeia posts para agenda com status pendente', async () => {
    const result = await schedulerAgent(planner);
    expect(result.approvalStatus).toBe('pending');
    expect(result.scheduled).toEqual([
      { dayIndex: 3, platform: 'instagram' },
      { dayIndex: 4, platform: 'both' },
    ]);
  });

  it('retorna agenda vazia para plano sem posts', async () => {
    const result = await schedulerAgent({ ...planner, posts: [] });
    expect(result.scheduled).toEqual([]);
    expect(result.approvalStatus).toBe('pending');
  });
});
