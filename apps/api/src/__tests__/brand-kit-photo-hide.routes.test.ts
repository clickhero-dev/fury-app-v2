import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describe, it, expect, vi } from 'vitest';
import { BrandKitPhotoController } from '../controllers/brand-kit-photo.controller.js';

const svc = vi.hoisted(() => ({ hideFromReferencePanel: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../di.js', () => ({ controllers: { brandKit: { get: vi.fn(), upsert: vi.fn(), uploadLogo: vi.fn(), uploadPhotos: vi.fn(), deletePhoto: vi.fn() }, brandKitPhotos: new BrandKitPhotoController(svc as never) } }));
import routes from '../routes/brand-kit.routes.js';
const app = express();
app.use('/brand-kit', routes);
const id = '123e4567-e89b-12d3-a456-426614174000';
const token = jwt.sign({ userId: id, tenantId: id, email: 'x@example.com', role: 'admin' }, process.env.JWT_SECRET!);

describe('rota para ocultar no painel', () => {
  it('exige autenticação', async () => {
    expect((await request(app).post(`/brand-kit/library/${id}/hide-from-reference-panel`)).status).toBe(401);
  });
  it('oculta com tenant autenticado', async () => {
    const res = await request(app).post(`/brand-kit/library/${id}/hide-from-reference-panel`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(svc.hideFromReferencePanel).toHaveBeenCalledWith(id, id);
  });
});
