import {describe,it,expect} from 'vitest';
import {isolatedCrossServiceConfig} from './chat-turn-cross-service.contract.js';

const env={CHAT_MEDIA_TEST_DATABASE_URL:'postgresql://synthetic:synthetic@127.0.0.1:32844/ady_cross_isolated',
  CHAT_SERVICE_URL:'http://127.0.0.1:8181',CHAT_CROSS_SERVICE_SCHEMA:'chat_media_'+'a'.repeat(32),
  CHAT_DELEGATION_SECRET:'synthetic-test-delegation-secret-32-characters'};
describe('cross-service test fixture isolation',()=>{
  it('permits only explicit disposable PG schemas and loopback HTTP',()=>{
    expect(isolatedCrossServiceConfig(env)).toMatchObject({schema:env.CHAT_CROSS_SERVICE_SCHEMA});
  });
  it.each([
    {CHAT_MEDIA_TEST_DATABASE_URL:'postgresql://remote.invalid/ady_cross_isolated'},
    {CHAT_MEDIA_TEST_DATABASE_URL:'postgresql://127.0.0.1/production'},
    {CHAT_MEDIA_TEST_DATABASE_URL:env.CHAT_MEDIA_TEST_DATABASE_URL+'?options=evil'},
    {CHAT_CROSS_SERVICE_SCHEMA:'public'},
    {CHAT_CROSS_SERVICE_SCHEMA:'chat_media_x;DROP SCHEMA public'},
    {CHAT_SERVICE_URL:'https://example.invalid'},
    {CHAT_SERVICE_URL:'http://127.0.0.1:8181/private'},
    {CHAT_SERVICE_URL:'http://user:password@127.0.0.1:8181'},
    {CHAT_DELEGATION_SECRET:'short'},
  ])('rejects unsafe configuration before any I/O: %j',unsafe=>{
    expect(()=>isolatedCrossServiceConfig({...env,...unsafe})).toThrow();
  });
});
