/*
Funcionalidade: acesso ao assistente e proteção das ferramentas
Cenário: o chat não exige permissão de um módulo específico
Dado um usuário autenticado
Quando acessa uma conversa do assistente
Então o chat não exige uma chave de módulo
Cenário: as ações continuam sujeitas às permissões dos módulos
Dado um usuário autenticado
Quando o assistente acessa campanhas ou estúdio em seu nome
Então as respectivas chaves de serviço são verificadas
*/
import { describe, expect, it } from 'vitest';
import { resolveServiceKeys } from '../middleware/rbac.middleware.js';
import { RBAC_EXEMPT_PREFIXES } from '../lib/rbac-services.js';

describe('RBAC do assistente', () => {
  it('permite acesso ao chat sem chave de módulo específica', () => {
    expect(RBAC_EXEMPT_PREFIXES).toContain('/chat');
    expect(resolveServiceKeys('/chat/conversations')).toEqual([]);
  });

  it('mantém as chaves das ferramentas de campanha e estúdio', () => {
    expect(resolveServiceKeys('/campaigns/create')).toContain('campaigns');
    expect(resolveServiceKeys('/studio/ai/generate-image')).toEqual(expect.arrayContaining(['studio', 'studio.ai']));
  });
});
