/* Funcionalidade: plano revisável, nunca uma execução inventada.
 * Cenário: Dado tarefas válidas, quando criadas, então permanecem draft.
 * Cenário: Dado DAG inválido ou payload arbitrário, quando validar, então retorna 400.
 * Cenário: Dado ator chat, quando iniciar/concluir, então retorna 403.
 * Cenário: Dado tarefa automática ou dependência pendente, quando concluir, então bloqueia.
 * Cenário: Dado plano iniciado, quando editar, então preserva evidência e retorna 409.
 * Cenário: Dado pausa/cancelamento, quando alterar, então mantém tarefas em curso.
 */
import { describe, it, expect, vi } from 'vitest';
vi.mock('../lib/analytics.js', () => ({ captureServerException: vi.fn() }));
import { parsePlanInput, newPlan, changePlan, editPlan, publicPlan } from '../services/chat/chat-plan.domain.js';
const input = { title: 'Preparar semana', goal: 'Criar conteúdo', tasks: [{ key: 'marca', title: 'Consultar marca', capability: 'read_brand', parameters: {}, dependsOn: [] }, { key: 'revisao', title: 'Revisar', capability: 'manual', parameters: { instructions: 'Revise a marca' }, dependsOn: ['marca'] }] };
const plan = () => newPlan('11111111-1111-4111-8111-111111111111', parsePlanInput(input));
describe('planos e transições', () => {
    it('cria draft sem execução e oculta fences', () => {
        const p = plan();
        expect(p.status).toBe('draft');
        expect(p.tasks.every(t => t.status === 'pending')).toBe(true);
        expect(publicPlan(p).tasks[0]).not.toHaveProperty('attempts');
    });
    it.each([
        { ...input, tasks: [] },
        { ...input, tasks: Array.from({ length: 21 }, (_, i) => ({ ...input.tasks[0], key: `t${i}` })) },
        { ...input, tasks: [input.tasks[0], input.tasks[0]] },
        { ...input, tasks: [{ ...input.tasks[0], dependsOn: ['inexistente'] }] },
        { ...input, tasks: [{ ...input.tasks[0], dependsOn: ['marca'] }] },
        { ...input, tasks: [{ ...input.tasks[0], dependsOn: ['revisao'] }, input.tasks[1]] },
        { ...input, tasks: [{ ...input.tasks[0], capability: 'shell' }] },
        { ...input, tasks: [{ ...input.tasks[0], parameters: { url: 'https://example.com' } }] },
        { ...input, tasks: [{ ...input.tasks[0], status: 'completed' }] },
        { ...input, tasks: [{ ...input.tasks[0], capability: 'read_calendar', parameters: { startDate: '2026-02-30', endDate: '2026-03-10' } }] },
    ])('rejeita schema/DAG inválido', value => expect(() => parsePlanInput(value)).toThrow());
    it.each(['approve', 'pause', 'resume', 'cancel', 'complete'] as const)('chat não pode %s', action => {
        expect(() => changePlan(plan(), action, 'chatbot')).toThrowError(expect.objectContaining({ statusCode: 403 }));
    });
    it('só humano conclui manual quando dependências concluídas', () => {
        const p = plan();
        changePlan(p, 'approve', 'human');
        expect(() => changePlan(p, 'complete', 'human', p.tasks[0].id)).toThrowError(expect.objectContaining({ statusCode: 403 }));
        expect(() => changePlan(p, 'complete', 'human', p.tasks[1].id)).toThrow();
        p.tasks[0].status = 'completed';
        changePlan(p, 'complete', 'human', p.tasks[1].id);
        expect(p.status).toBe('completed');
        expect(p.tasks[1].result?.summary).toContain('usuário');
    });
    it('não reescreve um plano iniciado', () => {
        const p = plan();
        changePlan(p, 'approve', 'human');
        expect(() => editPlan(p, { title: 'Revisado' })).toThrowError(expect.objectContaining({ statusCode: 409 }));
    });
    it('cancelamento preserva resultado em curso e cancela apenas restantes', () => {
        const p = plan();
        changePlan(p, 'approve', 'human');
        p.tasks[0].status = 'running';
        changePlan(p, 'pause', 'human');
        expect(p.tasks[0].status).toBe('running');
        changePlan(p, 'resume', 'human');
        changePlan(p, 'cancel', 'human');
        expect(p.tasks[0].status).toBe('running');
        expect(p.tasks[1].status).toBe('cancelled');
    });
});
