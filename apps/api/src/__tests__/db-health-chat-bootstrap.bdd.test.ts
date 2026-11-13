import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

describe('Inicialização do worker de planos com health do banco', () => {
  it('inicia o worker somente após o bootstrap e preserva o encerramento', () => {
    const ready = source.indexOf('void startupReady.then(() => {');
    const start = source.indexOf('void startChatPlanWorker(chatPlanRuntime.executor)');
    const workflow = source.indexOf('await runApiStartupWorkflow()');
    const markReady = source.indexOf('markStartupReady?.()');
    expect(source).not.toContain('<<<<<<<');
    expect(ready).toBeGreaterThan(-1);
    expect(start).toBeGreaterThan(ready);
    expect(start).toBeLessThan(workflow);
    expect(markReady).toBeGreaterThan(workflow);
    expect(source).toContain('await stopChatPlanWorker()');
  });
});
