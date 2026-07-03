import { describe, it, expect, vi } from 'vitest';
import { registerSSEClient, removeSSEClient, emitToTenant } from '../lib/sse.js';

function makeMockRes() {
  const write = vi.fn();
  const on = vi.fn((_event: string, cb: () => void) => {
    // store cb for manual close simulation
    return res;
  });
  const res = {
    write,
    on,
    writableEnded: false,
  } as any;
  return res;
}

describe('sse', () => {
  it('registerSSEClient adds client', () => {
    const res = makeMockRes();
    registerSSEClient('tenant-1', res);
    // doesn't throw — client registered
    // emit should reach it
    emitToTenant('tenant-1', 'test', { msg: 'hello' });
    expect(res.write).toHaveBeenCalledTimes(1);
    expect(res.write.mock.calls[0][0]).toContain('test');
    expect(res.write.mock.calls[0][0]).toContain('hello');
  });

  it('emitToTenant does nothing for unknown tenant', () => {
    expect(() => emitToTenant('no-such-tenant', 'event', {})).not.toThrow();
  });

  it('removeSSEClient removes client', () => {
    const res = makeMockRes();
    registerSSEClient('tenant-2', res);
    removeSSEClient('tenant-2', res);
    emitToTenant('tenant-2', 'event', {});
    expect(res.write).not.toHaveBeenCalled();
  });

  it('removeSSEClient does nothing for unknown tenant', () => {
    const res = makeMockRes();
    expect(() => removeSSEClient('no-such', res)).not.toThrow();
  });

  it('does not write to ended response', () => {
    const res = makeMockRes();
    res.writableEnded = true;
    registerSSEClient('tenant-3', res);
    emitToTenant('tenant-3', 'event', {});
    expect(res.write).not.toHaveBeenCalled();
  });

  it('multiple clients same tenant all receive events', () => {
    const res1 = makeMockRes();
    const res2 = makeMockRes();
    registerSSEClient('tenant-4', res1);
    registerSSEClient('tenant-4', res2);
    emitToTenant('tenant-4', 'update', { x: 1 });
    expect(res1.write).toHaveBeenCalledTimes(1);
    expect(res2.write).toHaveBeenCalledTimes(1);
  });
});
