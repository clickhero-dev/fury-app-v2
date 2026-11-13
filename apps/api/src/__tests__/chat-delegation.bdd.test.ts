/*
Funcionalidade: delegação segura para o assistente
Cenário: uma delegação identifica o usuário e expira rapidamente
Dado um usuário autenticado
Quando a API emite uma delegação
Então ela identifica o usuário e o ator chatbot
Cenário: uma delegação não permite acesso a rotas fora das ferramentas
Dado um token delegado válido
Quando ele é usado fora das rotas permitidas
Então o acesso é negado
Cenário: um token adulterado é rejeitado
Dado um token inválido
Quando a API verifica a delegação
Então ele não é aceito
Cenário: bloquear delegação sem prazo limitado
Dado um token sem expiração ou com mais de cinco minutos de validade
Quando a API verifica a delegação
Então a autorização é recusada
*/
import { describe, it, expect } from 'vitest';
import { createChatDelegation, verifyChatDelegation, isChatToolPath } from '../lib/chat-delegation.js';
import jwt from 'jsonwebtoken';

const secret = 'test-secret-with-sufficient-entropy-1234567890';
const user = { userId: 'u1', tenantId: 't1', email: 'a@example.com', role: 'admin' };

describe('delegação do chatbot', () => {
  it('emite identidade e ator com prazo curto', () => {
    const decoded = verifyChatDelegation(createChatDelegation(user, secret), secret);
    expect(decoded).toMatchObject({ ...user, actor: 'chatbot', iss: 'ady-api' });
    expect(decoded.exp! - decoded.iat!).toBe(300);
  });
  it('limita as rotas acessíveis', () => {
    expect(isChatToolPath('/api/studio/ai/generate-image')).toBe(true);
    expect(isChatToolPath('/api/campaigns/chat-account/act_123')).toBe(true);
    expect(isChatToolPath('/api/campaigns/chat-account/act_123/extra')).toBe(false);
    expect(isChatToolPath('/api/admin/users')).toBe(false);
    expect(isChatToolPath('/api/studio/../admin/users')).toBe(false);
  });
  it('rejeita assinatura inválida', () => {
    const token = createChatDelegation(user, secret);
    expect(() => verifyChatDelegation(token, 'incorrect-secret')).toThrow();
  });
  it('rejeita delegação sem prazo ou com validade maior que cinco minutos', () => {
    const claims={...user,actor:'chatbot'};
    const options={issuer:'ady-api',audience:'ady-api'};
    const noExpiry=jwt.sign(claims,secret,options);
    const longExpiry=jwt.sign(claims,secret,{...options,expiresIn:3600});
    expect(()=>verifyChatDelegation(noExpiry,secret)).toThrow();
    expect(()=>verifyChatDelegation(longExpiry,secret)).toThrow();
  });
});
