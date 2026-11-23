/*
Funcionalidade: proteger Redis compartilhado em testes de recuperação
Cenário: usar banco dedicado local
Dado URLs de teste e de execução iguais no banco Redis 15 local
Quando a configuração é validada
Então ela é aceita
Cenário: rejeitar Redis compartilhado ou remoto
Dado URLs diferentes, banco padrão ou servidor remoto
Quando a configuração é validada
Então ela é recusada antes de conectar
*/
import {describe,it,expect} from 'vitest';
import {isSafeChatTestRedis} from './helpers/chat-test-redis.js';
describe('isolamento Redis de testes',()=>{
 it('aceita somente banco local dedicado',()=>{expect(isSafeChatTestRedis('redis://127.0.0.1:6379/15','redis://127.0.0.1:6379/15')).toBe(true);});
 it('recusa URLs diferentes, remoto e banco padrão',()=>{expect(isSafeChatTestRedis('redis://127.0.0.1:6379/15','redis://127.0.0.1:6379/0')).toBe(false);expect(isSafeChatTestRedis('redis://example.com:6379/15','redis://example.com:6379/15')).toBe(false);expect(isSafeChatTestRedis('redis://127.0.0.1:6379','redis://127.0.0.1:6379')).toBe(false);});
});
