import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ find: vi.fn(), quota: vi.fn(), video: vi.fn(), tenants: [] as string[] }));
vi.mock('../repository/subscription.repository.js', () => ({
  SubscriptionRepository: class {
    constructor(tenant: string) { mocks.tenants.push(tenant); }
    findSubscription = mocks.find;
    getCreativeQuotaSnapshot = mocks.quota;
  },
}));
vi.mock('../repository/meta.repository.js', () => ({ MetaRepository: class {} }));
vi.mock('../services/studio/studio-video.service.js', () => ({ StudioVideoService: class { getOptions = mocks.video; } }));

import { createChatReadCapabilities } from '../services/chat/chat-read-runtime.js';

describe('chat read runtime subscription', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.tenants.length = 0; vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-13T12:00:00Z')); });
  afterEach(() => vi.useRealTimers());
  it('does not load image quota for video-only access', async () => {
    mocks.find.mockResolvedValue({status:'active', currentPeriodEnd:new Date('2026-11-14T12:00:00Z')});
    mocks.video.mockResolvedValue({videosLimit:1, videosRemaining:0});
    expect(await createChatReadCapabilities().quota('tenant-a', {images:false,videos:true})).toEqual({subscription:'active',images:null,videos:{limit:1,remaining:0}});
    expect(mocks.quota).not.toHaveBeenCalled(); expect(mocks.video).toHaveBeenCalledWith('tenant-a');
  });
  it('allows an unexpired trial', async () => {
    mocks.find.mockResolvedValue({status:'trial', trialEndsAt:new Date('2026-11-13T12:00:00.001Z')});
    mocks.quota.mockResolvedValue({creativesLimit:5, creativesRemaining:2});
    mocks.video.mockResolvedValue({videosLimit:1, videosRemaining:1});
    expect((await createChatReadCapabilities().quota('tenant-a')).subscription).toBe('active');
  });
  it('returns actual quota for a demo user with an active subscription past its period', async () => {
    mocks.find.mockResolvedValue({status:'active', isNonExpirable:true, currentPeriodEnd:new Date('2026-11-13T11:59:59Z')});
    mocks.quota.mockResolvedValue({creativesLimit:5, creativesRemaining:2});
    mocks.video.mockResolvedValue({videosLimit:3, videosRemaining:1});
    expect(await createChatReadCapabilities('demo').quota('tenant-a')).toEqual({subscription:'active',images:{limit:5,remaining:2},videos:{limit:3,remaining:1}});
    expect(mocks.quota).toHaveBeenCalledOnce();
    expect(mocks.video).toHaveBeenCalledWith('tenant-a');
  });
  it('does not report a normal subscription past its billing period as active, even if non-expirable', async () => {
    mocks.find.mockResolvedValue({status:'active', isNonExpirable:true, currentPeriodEnd:new Date('2026-11-13T11:59:59Z')});
    expect((await createChatReadCapabilities('owner').quota('tenant-a')).subscription).toBe('expired');
    expect(mocks.quota).not.toHaveBeenCalled();
    expect(mocks.video).not.toHaveBeenCalled();
  });
  it('does not exempt an expired subscription when role is absent', async () => {
    mocks.find.mockResolvedValue({status:'active', isNonExpirable:true, currentPeriodEnd:new Date('2026-11-13T11:59:59Z')});
    expect(await createChatReadCapabilities().quota('tenant-a')).toEqual({subscription:'expired', images:null, videos:null});
    expect(mocks.quota).not.toHaveBeenCalled();
    expect(mocks.video).not.toHaveBeenCalled();
  });
  it('does not report an expired trial as active at the exact expiry boundary', async () => {
    mocks.find.mockResolvedValue({status:'trial', trialEndsAt:new Date('2026-11-13T12:00:00Z')});
    mocks.quota.mockResolvedValue({creativesLimit:5, creativesRemaining:2});
    mocks.video.mockResolvedValue({videosLimit:1, videosRemaining:1});
    expect(await createChatReadCapabilities().quota('tenant-a')).toEqual({subscription:'expired', images:null, videos:null});
    expect(mocks.tenants).toEqual(['tenant-a']);
    expect(mocks.quota).not.toHaveBeenCalled(); expect(mocks.video).not.toHaveBeenCalled();
  });
});
