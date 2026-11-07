/*
 * Funcionalidade: Trial só confirma o email quando a pessoa usa o link recebido.
 * Cenários:
 * - Dado novo cadastro, quando a conta é criada, então ainda não está verificada.
 * - Dado link válido, quando é consumido, então o token torna-se único e o email é verificado.
 * - Dado token inválido/expirado, quando tenta consumir, então nenhum usuário é verificado.
 * - Dado email atual diferente do email original do Trial, quando solicita link, então não pode acessar a conta.
 * - Dado email original igual ao atual, quando solicita novo link, então pode recuperar o acesso ao Trial.
 * - Dado conflito de criação e email divergente, quando recupera a conta existente, então não libera link.
 * - Dado conta legada sem email original confiável, quando solicita link, então a recuperação falha de forma segura.
 * - Dado usuário com ou sem vínculo Trial público, quando consulta elegibilidade, então retorna presença do vínculo.
 * - Dado snapshot de email validado, quando retorna conta elegível, então fornece esse endereço como destinatário confiável.
 * - Dado conta Trial com email atual alterado, quando o email original solicita acesso, então falha fechado sem criar outra conta.
 * - Dado link emitido, quando o email atual mudou antes do uso, então não cria sessão nem verifica o email.
 * - Dado email alterado entre leitura e UPDATE, quando o link é consumido, então o UPDATE condicional rejeita a verificação.
 * - Dado elegibilidade Trial válida, quando emite sessão, então mantém lock nas linhas até concluir a emissão.
 * - Dado email atual divergente do snapshot ao adquirir lock, quando emite sessão, então nega sem chamar o emissor.
 */
import { describe, expect, it, vi } from 'vitest';
import { publicTrialAccounts, publicTrialMagicLinks, subscriptions, tenants, users } from '@fury/db';
import { PublicTrialRepository } from '../repository/public-trial.repository.js';

const trialPlan = {
  id: 'plan-trial', isActive: true, priceCents: 0,
  features: { trialDays: 7, images: 5, revisionsPerImage: 3, videos: false },
  limits: { creativesPerMonth: 5, modificationsPerCreative: 3, videosPerMonth: 0 },
};

function drizzleColumnNames(value: unknown, seen = new Set<object>()): string[] {
  if (!value || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);
  if ('columnType' in value && 'name' in value && typeof value.name === 'string') return [value.name];
  if (Array.isArray(value)) return value.flatMap((item) => drizzleColumnNames(item, seen));
  return Object.values(value).flatMap((item) => drizzleColumnNames(item, seen));
}

function makeDb(options: {
  token?: boolean;
  emailChangesBeforeUserUpdate?: boolean;
  existingUser?: Record<string, unknown> | null;
  existingAccount?: Record<string, unknown> | null;
} = {}) {
  const insertRows: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const updateRows: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const tx: any = {
    query: {
      users: { findFirst: vi.fn().mockResolvedValue(options.existingUser ?? null) },
      plans: { findFirst: vi.fn().mockResolvedValue(trialPlan) },
      publicTrialAccounts: { findFirst: vi.fn().mockResolvedValue(options.existingAccount ?? null) },
    },
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: Record<string, unknown>) => {
        insertRows.push({ table, values });
        const row = table === tenants ? { id: 'tenant-1', ...values }
          : table === users ? { id: 'user-1', createdAt: new Date(), emailVerified: false, ...values }
          : { id: 'account-1', ...values };
        return { returning: vi.fn().mockResolvedValue([row]) };
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: Record<string, unknown>) => {
        updateRows.push({ table, values });
        return { where: vi.fn((condition: unknown) => ({ returning: vi.fn().mockResolvedValue(
          table === publicTrialMagicLinks && options.token === false ? []
            : table === publicTrialMagicLinks ? [{ accountId: 'account-1' }]
            : table === users && options.emailChangesBeforeUserUpdate && drizzleColumnNames(condition).includes('email') ? []
            : [{ id: 'user-1', tenantId: 'tenant-1', email: 'ana@example.com', name: 'Ana', role: 'owner', createdAt: new Date(), emailVerified: true }],
        ) })) };
      }),
    })),
  };
  const db: any = { transaction: (callback: (executor: any) => unknown) => callback(tx), query: tx.query, update: tx.update };
  return { db, insertRows, updateRows, tx };
}

describe('PublicTrialRepository email verification', () => {
  it('Dado novo cadastro, quando cria a conta, então mantém emailVerified falso até o link ser usado', async () => {
    const { db, insertRows } = makeDb();
    const result = await new PublicTrialRepository(db).createOrFindAccount({ name: 'Ana', email: 'ana@example.com' });
    const userInsert = insertRows.find((row) => row.table === users);
    const accountInsert = insertRows.find((row) => row.table === publicTrialAccounts);
    const subscriptionInsert = insertRows.find((row) => row.table === subscriptions);
    expect(userInsert?.values.emailVerified).toBe(false);
    expect(accountInsert?.values.signupEmail).toBe('ana@example.com');
    expect(subscriptionInsert?.values).toMatchObject({
      tenantId: 'tenant-1', planId: 'plan-trial', status: 'trial', creativesRemaining: 5,
      trialEndsAt: expect.any(Date),
    });
    expect(result).toMatchObject({ deliveryEmail: 'ana@example.com' });
  });

  it('Dado token válido, quando é consumido, então marca o email verificado no mesmo fluxo', async () => {
    const { db, updateRows } = makeDb({
      existingUser: { id: 'user-1', tenantId: 'tenant-1', email: 'ana@example.com', emailVerified: false },
      existingAccount: { id: 'account-1', userId: 'user-1', signupEmail: 'ana@example.com' },
    });
    const user = await new PublicTrialRepository(db).consumeToken('hash', new Date('2026-11-07T12:00:00Z'));
    expect(user).toMatchObject({ id: 'user-1', emailVerified: true });
    expect(updateRows).toContainEqual({ table: publicTrialMagicLinks, values: { consumedAt: new Date('2026-11-07T12:00:00Z') } });
    expect(updateRows).toContainEqual({ table: users, values: { emailVerified: true } });
  });

  it('Dado link emitido, quando o email atual mudou antes do uso, então não cria sessão nem verifica o email', async () => {
    const { db, updateRows } = makeDb({
      existingUser: { id: 'user-1', tenantId: 'tenant-1', email: 'changed@example.net', emailVerified: false },
      existingAccount: { id: 'account-1', userId: 'user-1', signupEmail: 'ana@example.com' },
    });

    await expect(new PublicTrialRepository(db).consumeToken('hash', new Date('2026-11-07T12:00:00Z'))).resolves.toBeNull();
    expect(updateRows).toContainEqual({ table: publicTrialMagicLinks, values: { consumedAt: new Date('2026-11-07T12:00:00Z') } });
    expect(updateRows.some((row) => row.table === users)).toBe(false);
  });

  it('Dado email alterado entre leitura e UPDATE, quando o link é consumido, então o UPDATE condicional rejeita a verificação', async () => {
    const { db } = makeDb({
      emailChangesBeforeUserUpdate: true,
      existingUser: { id: 'user-1', tenantId: 'tenant-1', email: 'ana@example.com', emailVerified: false },
      existingAccount: { id: 'account-1', userId: 'user-1', signupEmail: 'ana@example.com' },
    });

    await expect(new PublicTrialRepository(db).consumeToken('hash', new Date('2026-11-07T12:00:00Z'))).resolves.toBeNull();
  });

  it('Dado token inválido ou expirado, quando tenta consumir, então não verifica nenhum email', async () => {
    const { db, updateRows } = makeDb({ token: false });
    await expect(new PublicTrialRepository(db).consumeToken('hash', new Date())).resolves.toBeNull();
    expect(updateRows.some((row) => row.table === users)).toBe(false);
  });

  it('Dado email atual diferente do email original do Trial, quando solicita acesso, então não libera link para a conta existente', async () => {
    const { db } = makeDb({
      existingUser: { id: 'user-1', tenantId: 'tenant-1', email: 'attacker@example.com', emailVerified: false },
      existingAccount: { id: 'account-1', userId: 'user-1', signupEmail: 'owner@example.com' },
    });
    const result = await new PublicTrialRepository(db).createOrFindAccount({ name: 'Attacker', email: 'attacker@example.com' });
    expect(result).toMatchObject({ created: false, accountId: null, isPublicTrial: false });
  });

  it('Dado email original igual ao email atual, quando solicita novo acesso, então mantém a conta elegível para reenvio', async () => {
    const { db } = makeDb({
      existingUser: { id: 'user-1', tenantId: 'tenant-1', email: 'ana@example.com', emailVerified: false },
      existingAccount: { id: 'account-1', userId: 'user-1', signupEmail: 'ana@example.com' },
    });
    const result = await new PublicTrialRepository(db).createOrFindAccount({ name: 'Ana', email: 'ana@example.com' });
    expect(result).toMatchObject({ created: false, accountId: 'account-1', isPublicTrial: true, deliveryEmail: 'ana@example.com' });
  });

  it('Dado conflito de criação e email divergente, quando recupera a conta existente, então não libera link', async () => {
    const { db } = makeDb({
      existingUser: { id: 'user-1', tenantId: 'tenant-1', email: 'attacker@example.com', emailVerified: false },
      existingAccount: { id: 'account-1', userId: 'user-1', signupEmail: 'owner@example.com' },
    });
    db.transaction = vi.fn().mockRejectedValue(Object.assign(new Error('unique conflict'), { code: '23505', constraint: 'users_email_unique' }));
    const result = await new PublicTrialRepository(db).createOrFindAccount({ name: 'Attacker', email: 'attacker@example.com' });
    expect(result).toMatchObject({ created: false, accountId: null, isPublicTrial: false });
  });

  it('Dado conflito de criação e snapshot correspondente, quando recupera a conta, então devolve o snapshot como destinatário', async () => {
    const { db } = makeDb({
      existingUser: { id: 'user-1', tenantId: 'tenant-1', email: 'ana@example.com', emailVerified: false },
      existingAccount: { id: 'account-1', userId: 'user-1', signupEmail: 'ana@example.com' },
    });
    db.transaction = vi.fn().mockRejectedValue(Object.assign(new Error('unique conflict'), { code: '23505', constraint: 'public_trial_accounts_signup_email_unique' }));

    const result = await new PublicTrialRepository(db).createOrFindAccount({ name: 'Ana', email: 'ana@example.com' });

    expect(result).toMatchObject({ created: false, accountId: 'account-1', isPublicTrial: true, deliveryEmail: 'ana@example.com' });
  });

  it('Dado conflito único não relacionado ao email, quando provisiona, então propaga o erro sem mascarar falha', async () => {
    const { db } = makeDb({
      existingUser: { id: 'user-1', tenantId: 'tenant-1', email: 'ana@example.com', emailVerified: false },
      existingAccount: { id: 'account-1', userId: 'user-1', signupEmail: 'ana@example.com' },
    });
    const error = Object.assign(new Error('tenant slug conflict'), { code: '23505', constraint: 'tenants_slug_unique' });
    db.transaction = vi.fn().mockRejectedValue(error);

    await expect(new PublicTrialRepository(db).createOrFindAccount({ name: 'Ana', email: 'ana@example.com' }))
      .rejects.toBe(error);
  });

  it('Dado conta Trial com email atual alterado, quando o email original solicita acesso, então falha fechado sem criar outra conta', async () => {
    const account = { id: 'account-1', userId: 'user-1', signupEmail: 'ana@example.com' };
    const user = { id: 'user-1', tenantId: 'tenant-1', email: 'changed@example.net', emailVerified: true };
    const { db, tx, insertRows } = makeDb();
    const whereColumn = (query: any) => query.where.queryChunks.find((chunk: any) => typeof chunk?.name === 'string')?.name;
    tx.query.users.findFirst = vi.fn((query: any) => Promise.resolve(whereColumn(query) === 'id' ? user : null));
    tx.query.publicTrialAccounts.findFirst = vi.fn((query: any) => Promise.resolve(whereColumn(query) === 'signup_email' ? account : null));

    const result = await new PublicTrialRepository(db).createOrFindAccount({ name: 'Ana', email: 'ana@example.com' });

    expect(result).toMatchObject({ created: false, accountId: null, isPublicTrial: false, deliveryEmail: null });
    expect(insertRows).toHaveLength(0);
  });

  it('Dado conta legada sem email original confiável, quando solicita acesso, então não libera link com base no email atual', async () => {
    const { db } = makeDb({
      existingUser: { id: 'user-1', tenantId: 'tenant-1', email: 'current@example.com', emailVerified: true },
      existingAccount: { id: 'account-1', userId: 'user-1', signupEmail: null },
    });
    const result = await new PublicTrialRepository(db).createOrFindAccount({ name: 'User', email: 'current@example.com' });
    expect(result).toMatchObject({ created: false, accountId: null, isPublicTrial: false });
  });

  it('Dado elegibilidade Trial válida, quando emite sessão, então mantém lock nas linhas até concluir a emissão', async () => {
    const user = { id: 'u1', email: 'ana@example.com' };
    const account = { id: 'account-1', userId: 'u1', signupEmail: 'ana@example.com' };
    const builder = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      for: vi.fn().mockResolvedValue([{ user, account }]),
    };
    let transactionOpen = false;
    const tx = { select: vi.fn(() => builder) };
    const db = {
      transaction: vi.fn(async (callback: (executor: typeof tx) => Promise<unknown>) => {
        transactionOpen = true;
        try { return await callback(tx); } finally { transactionOpen = false; }
      }),
    } as any;
    const issueSession = vi.fn(async (lockedUser: typeof user) => {
      expect(transactionOpen).toBe(true);
      expect(lockedUser).toEqual(user);
      return 'issued';
    });
    const repository = new PublicTrialRepository(db);

    await expect(repository.withPublicTrialSessionUser('u1', issueSession)).resolves.toBe('issued');

    expect(builder.for).toHaveBeenCalledWith('update', { of: [users, publicTrialAccounts] });
    expect(issueSession).toHaveBeenCalledOnce();
    expect(transactionOpen).toBe(false);
  });

  it('Dado email atual divergente do snapshot ao adquirir lock, quando emite sessão, então nega sem chamar o emissor', async () => {
    const builder = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      for: vi.fn().mockResolvedValue([]),
    };
    const tx = { select: vi.fn(() => builder) };
    const db = { transaction: vi.fn(async (callback: (executor: typeof tx) => Promise<unknown>) => callback(tx)) } as any;
    const issueSession = vi.fn();

    await expect(new PublicTrialRepository(db).withPublicTrialSessionUser('u1', issueSession)).resolves.toBeNull();
    expect(issueSession).not.toHaveBeenCalled();
    expect(builder.for).toHaveBeenCalledWith('update', { of: [users, publicTrialAccounts] });
  });
});
