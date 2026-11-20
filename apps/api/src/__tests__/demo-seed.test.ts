/* # Language: pt-BR
Funcionalidade: provisionar conta demo utilizável
  Cenário: novo tenant é marcado como demo sem divulgar senha
    Dado que a conta demo ainda não existe
    Quando o provisionamento termina
    Então o tenant está marcado demo e a senha não aparece nos logs
*/
import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ values: [] as any[], exit: vi.fn() }));
vi.mock('../../../../packages/db/src/client.js', () => ({ db: {
  query: { users: { findFirst: vi.fn(async () => null) }, plans: { findFirst: vi.fn(async () => ({ id: 'plan' })) } },
  insert: vi.fn(() => ({ values: (data: any) => { state.values.push(data); return { returning: async () => [{ id: 'created', ...data }] }; } })),
} }));
vi.mock('bcrypt', () => ({ default: { hash: vi.fn(async () => 'hashed') } }));
it('Cenário: seed cria tenant explicitamente demo sem registrar a senha', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation(state.exit as any);
  vi.stubEnv('DEMO_PASSWORD', 'sensitive-seed-password');
  try {
    await import('../../../../packages/db/src/create-demo-user.js');
    await vi.waitFor(() => expect(state.exit).toHaveBeenCalledWith(0));
    expect(state.values.find(v => v.slug === 'fashion-demo')).toMatchObject({ isDemo: true });
    expect(JSON.stringify(log.mock.calls)).not.toContain('sensitive-seed-password');
  } finally { vi.restoreAllMocks(); vi.unstubAllEnvs(); }
});
