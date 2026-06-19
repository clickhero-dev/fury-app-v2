import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { db, requestLogs } from '@fury/db';
import { flushRequestLogs } from '../middleware/request-logger.js';

describe('Request Logger Middleware', () => {
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  beforeEach(async () => {
    await db.delete(requestLogs);
  });

  afterEach(async () => {
    await flushRequestLogs();
  });

  it('should log request with valid data', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User',
        email: `test-${Date.now()}@example.com`,
        password: 'SecurePass123!',
        companyName: 'Test Company',
      });

    await flushRequestLogs();

    const logs = await db.select().from(requestLogs);
    expect(logs.length).toBeGreaterThan(0);

    const log = logs[logs.length - 1];
    expect(log.method).toBe('POST');
    expect(log.path).toContain('/api/auth/register');
    expect(log.statusCode).toBe(201);
    expect(log.responseTimeMs).toBeGreaterThan(0);
  });

  it('should sanitize sensitive headers', async () => {
    await request(app)
      .post('/api/auth/register')
      .set('Authorization', 'Bearer secret_token_12345')
      .set('Cookie', 'session=secret_session')
      .send({
        name: 'Test User',
        email: `test-${Date.now()}@example.com`,
        password: 'SecurePass123!',
        companyName: 'Test Company',
      });

    await flushRequestLogs();

    const logs = await db.select().from(requestLogs);
    const log = logs[logs.length - 1];

    expect(log.requestHeaders).toBeDefined();
    const headers = log.requestHeaders as Record<string, any>;
    expect(headers.authorization).toBeUndefined();
    expect(headers.cookie).toBeUndefined();
  });

  it('should sanitize sensitive body fields', async () => {
    const sensitiveData = {
      name: 'John Doe',
      email: 'john@example.com',
      password: 'MySecurePassword123!',
      cpf: '12345678901',
      access_token: 'secret_access_token',
      refresh_token: 'secret_refresh_token',
      api_key: 'secret_api_key',
    };

    await request(app)
      .post('/api/auth/register')
      .send({
        ...sensitiveData,
        companyName: 'Test Company',
      });

    await flushRequestLogs();

    const logs = await db.select().from(requestLogs);
    const log = logs[logs.length - 1];

    expect(log.requestBody).toBeDefined();
    const body = log.requestBody as Record<string, any>;

    expect(body.password).toBe('[REDACTED]');
    expect(body.cpf).toBe('[REDACTED]');
    expect(body.access_token).toBe('[REDACTED]');
    expect(body.refresh_token).toBe('[REDACTED]');
    expect(body.api_key).toBe('[REDACTED]');

    expect(body.name).toBe('John Doe');
    expect(body.email).toBe('john@example.com');
    expect(body.companyName).toBe('Test Company');
  });

  it('should generate request_id header if not provided', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User',
        email: `test-${Date.now()}@example.com`,
        password: 'SecurePass123!',
        companyName: 'Test Company',
      });

    await flushRequestLogs();

    const logs = await db.select().from(requestLogs);
    const log = logs[logs.length - 1];

    expect(log.requestId).toBeDefined();
    expect(log.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('should use provided x-request-id header if valid UUID', async () => {
    const customRequestId = '550e8400-e29b-41d4-a716-446655440000';

    const response = await request(app)
      .post('/api/auth/register')
      .set('x-request-id', customRequestId)
      .send({
        name: 'Test User',
        email: `test-${Date.now()}@example.com`,
        password: 'SecurePass123!',
        companyName: 'Test Company',
      });

    expect(response.get('x-request-id')).toBe(customRequestId);

    await flushRequestLogs();

    const logs = await db.select().from(requestLogs);
    const log = logs[logs.length - 1];

    expect(log.requestId).toBe(customRequestId);
  });

  it('should truncate large request bodies', async () => {
    const largePayload = {
      name: 'Test',
      email: 'test@example.com',
      password: 'pass123',
      companyName: 'Test Co',
      data: 'x'.repeat(50000),
    };

    await request(app)
      .post('/api/auth/register')
      .send(largePayload);

    await flushRequestLogs();

    const logs = await db.select().from(requestLogs);
    const log = logs[logs.length - 1];

    expect(log.requestBody).toBeDefined();
    const body = log.requestBody as Record<string, any>;
    expect(body._truncated || body._unserializable).toBeDefined();
  });

  it('should log request with correct status codes', async () => {
    await request(app)
      .get('/invalid-route-that-doesnt-exist');

    await flushRequestLogs();

    const logs = await db.select().from(requestLogs);
    const log = logs[logs.length - 1];

    expect(log.statusCode).toBe(404);
  });

  it('should batch insert logs after flush interval', async () => {
    const initialCount = await db.select().from(requestLogs);
    expect(initialCount.length).toBe(0);

    const id1 = Date.now().toString();
    const id2 = (Date.now() + 1).toString();
    const id3 = (Date.now() + 2).toString();

    await request(app)
      .post('/api/auth/register')
      .send({
        name: 'User 1',
        email: `user1-${id1}@example.com`,
        password: 'SecurePass123!',
        companyName: 'Company 1',
      });

    await request(app)
      .post('/api/auth/register')
      .send({
        name: 'User 2',
        email: `user2-${id2}@example.com`,
        password: 'SecurePass123!',
        companyName: 'Company 2',
      });

    await request(app)
      .post('/api/auth/register')
      .send({
        name: 'User 3',
        email: `user3-${id3}@example.com`,
        password: 'SecurePass123!',
        companyName: 'Company 3',
      });

    await flushRequestLogs();

    const logs = await db.select().from(requestLogs);
    expect(logs.length).toBeGreaterThanOrEqual(3);
  });

  it('should handle nested sensitive objects', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        password: 'pass123',
        companyName: 'Test Co',
        nested: {
          level1: {
            password: 'nested_password',
            api_key: 'nested_api_key',
            publicField: 'should-be-visible',
          },
        },
      });

    await flushRequestLogs();

    const logs = await db.select().from(requestLogs);
    const log = logs[logs.length - 1];

    const body = log.requestBody as Record<string, any>;
    expect(body.nested.level1.password).toBe('[REDACTED]');
    expect(body.nested.level1.api_key).toBe('[REDACTED]');
    expect(body.nested.level1.publicField).toBe('should-be-visible');
  });
});
