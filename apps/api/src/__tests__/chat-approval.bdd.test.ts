/*
Funcionalidade: autorizar ações delegadas
Cenário: executar ação aprovada uma única vez
Dado uma aprovação válida vinculada ao usuário e parâmetros
Quando o chatbot solicita a execução
Então a API consome atomicamente a aprovação
Cenário: bloquear ação sem aprovação
Dado que não há aprovação correspondente
Quando o chatbot solicita a execução
Então a API nega a ação
Cenário: bloquear indisponibilidade da persistência
Dado que o banco não responde
Quando o chatbot solicita a execução
Então a API não executa a ação
*/
import { describe, it, expect, vi } from 'vitest';
import { authorizeChatAction } from '../services/core/chat-approval.service.js';

describe('aprovação delegada', () => {
  const action = { approvalId: 'id', userId: 'user', tenantId: 'tenant', method: 'POST', path: '/api/planner/posts', body: { text: 'oi' } };
  it('consome uma aprovação correspondente', async () => {
    const consume = vi.fn().mockResolvedValue(true);
    await expect(authorizeChatAction(action, { consume })).resolves.toBe(true);
    expect(consume).toHaveBeenCalledWith(action);
  });
  it('nega aprovação ausente ou já consumida', async () => {
    await expect(authorizeChatAction(action, { consume: async () => false })).resolves.toBe(false);
  });
  it('não autoriza se o repositório falhar', async () => {
    await expect(authorizeChatAction(action, { consume: async () => { throw Error('db'); } })).rejects.toThrow();
  });
});
