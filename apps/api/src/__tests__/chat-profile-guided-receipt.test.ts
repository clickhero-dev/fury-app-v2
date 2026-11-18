import { describe, expect, it, vi } from 'vitest';

vi.mock('@fury/db', () => ({ db: {} }));
vi.mock('../lib/analytics.js', () => ({ captureServerException: vi.fn() }));
import { ChatProfileRepository } from '../repository/chat-profile.repository.js';

const values = { tenantName: 'Loja Ana', businessContext: 'Flores' };
const fence = { conversationId: 'conversation', runId: 'run', leaseId: 'lease' };
const versions = { userVersion: '1', tenantVersion: '2' };
const saved = { ...versions, name: 'Ana', ...values };

function setup(marker: unknown, effect: unknown = undefined) {
  const receipt = { profileUpdate: values, profileExpected: versions, ...(marker === undefined ? {} : { nameVersionConfirmed: marker }) };
  const responses = [
    [{ id: 'conversation' }], [], [{ messageId: 'message' }], [{ result: receipt }],
    [versions], [{ messageId: 'message' }], effect ? [{ result: effect }] : [],
    [], [{ messageId: 'message' }], [], [saved], [], [{ messageId: 'message' }],
  ];
  const execute = vi.fn(async () => responses.shift() ?? []);
  const db = { transaction: async (callback: (tx: { execute: typeof execute }) => unknown) => callback({ execute }) };
  return { repo: new ChatProfileRepository('tenant', db as never), execute };
}

describe('guided profile receipt name confirmation', () => {
  it.each([undefined, false, 'true', null])('rejects a pending receipt with marker %s before updates', async marker => {
    const { repo, execute } = setup(marker);
    await expect(repo.applyGuided('user', values, fence)).rejects.toMatchObject({ code: 'CHAT_GUIDED_RECEIPT_MISMATCH' });
    expect(execute).toHaveBeenCalledTimes(7);
  });

  it('accepts a confirmed pending receipt', async () => {
    const { repo } = setup(true);
    await expect(repo.applyGuided('user', values, fence)).resolves.toEqual(saved);
  });

  it('replays an old applied receipt without updating the profile', async () => {
    const { repo, execute } = setup(undefined, saved);
    await expect(repo.applyGuided('user', values, fence)).resolves.toEqual(saved);
    expect(execute).toHaveBeenCalledTimes(7);
  });

  it('does not replay an old receipt after a subsequent profile edit', async () => {
    const { repo } = setup(undefined, { ...saved, tenantVersion: '3' });
    await expect(repo.applyGuided('user', values, fence)).rejects.toMatchObject({ code: 'CHAT_GUIDED_PROFILE_SUPERSEDED' });
  });
});
