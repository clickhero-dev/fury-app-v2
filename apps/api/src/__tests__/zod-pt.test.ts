import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/analytics.js', () => ({ captureServerException: vi.fn() }));

import { errorHandler } from '../middleware/errorHandler.js';
import { describeZodIssues } from '../lib/zod-pt.js';

const issues = (schema: z.ZodTypeAny, value: unknown) => {
  const r = schema.safeParse(value);
  if (r.success) throw new Error('esperava falha');
  return r.error.errors;
};

describe('zod em português', () => {
  it('traduz e-mail, tamanho e campo obrigatório', () => {
    const schema = z.object({ email: z.string().email(), password: z.string().min(8), name: z.string() });
    const msgs = issues(schema, { email: 'xx', password: '123' }).map((i) => i.message);
    expect(msgs).toEqual(['Endereço de e-mail inválido', 'Mínimo de 8 caracteres', 'Campo obrigatório']);
  });

  it('mensagem definida no schema continua valendo', () => {
    expect(issues(z.string().regex(/^a$/, 'Formato de chave inválido'), 'b')[0]!.message).toBe('Formato de chave inválido');
  });

  it('traduz número, lista e opção', () => {
    const schema = z.object({ n: z.number().max(10), list: z.array(z.string()).min(1), role: z.enum(['a', 'b']) });
    expect(issues(schema, { n: 11, list: [], role: 'c' }).map((i) => i.message)).toEqual([
      'Deve ser no máximo 10',
      'Mínimo de 1 item',
      'Opção inválida',
    ]);
  });

  it('describeZodIssues junta campo e motivo', () => {
    expect(describeZodIssues([{ path: ['email'], message: 'Endereço de e-mail inválido' }])).toBe(
      'Verifique o campo: E-mail: endereço de e-mail inválido.',
    );
    expect(
      describeZodIssues([
        { path: ['email'], message: 'Endereço de e-mail inválido' },
        { path: ['limits', 0, 'maxUsers'], message: 'Deve ser no mínimo 1' },
      ]),
    ).toBe('Verifique os campos: E-mail: endereço de e-mail inválido; maxUsers: deve ser no mínimo 1.');
    expect(describeZodIssues([{ path: [], message: 'Valor inválido' }])).toBe('Verifique o campo: Valor inválido.');
    expect(describeZodIssues([{ path: ['x'.repeat(100)], message: 'Valor inválido' }])).toBe(`Verifique o campo: ${'x'.repeat(40)}: valor inválido.`);
  });

  it('preserva sigla no início do motivo', () => {
    expect(describeZodIssues([{ path: ['id'], message: 'ID inválido' }])).toBe('Verifique o campo: id: ID inválido.');
  });

  it('chave extra não é listada', () => {
    expect(issues(z.object({ a: z.string() }).strict(), { a: 'ok', segredo: 1 })[0]!.message).toBe('Campo não permitido');
  });

  it('errorHandler responde 400 com o motivo em português', async () => {
    const app = express();
    app.use(express.json());
    app.post('/x', (req, _res, next) => {
      try {
        z.object({ email: z.string().email(), password: z.string().min(8) }).parse(req.body);
      } catch (err) {
        next(err);
      }
    });
    app.use(errorHandler);

    const res = await request(app).post('/x').send({ email: 'xx', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toBe('Verifique os campos: E-mail: endereço de e-mail inválido; Senha: mínimo de 8 caracteres.');
    expect(res.body.error.details.errors[1]).toMatchObject({ path: 'password', message: 'Mínimo de 8 caracteres' });
  });
});
