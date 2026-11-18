import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';

describe('turn recovery boot lifecycle',() => {
  it('starts actual recurring recovery and shuts it down with the API',() => {
    const source = readFileSync(new URL('../index.ts',import.meta.url),'utf8');
    expect(source).toContain('startChatTurnRecoveryWorker();');
    expect(source.match(/await stopChatTurnRecoveryWorker\(\)/g)?.length).toBe(1);
  });
});
