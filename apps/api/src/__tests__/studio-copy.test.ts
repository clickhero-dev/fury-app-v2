import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import studioRoutes from '../routes/studio.routes'

const mocks = vi.hoisted(() => ({
  chat: vi.fn(),
}))

// IA real do sistema é o OpenRouter; a regra de chave tem testes próprios
vi.mock('../services/llms/openrouter.service.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../services/llms/openrouter.service.js')>()
  return { ...real, openrouterService: { ...real.openrouterService, chat: mocks.chat } }
})

vi.mock('../middleware/auth.middleware.js', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}))

vi.mock('../middleware/tenant.middleware.js', () => ({
  tenantMiddleware: (req: any, _res: any, next: any) => {
    req.tenant = { tenantId: 'test-tenant-id' }
    next()
  },
}))

describe('POST /api/studio/generate-copy', () => {
  let app: express.Express

  beforeEach(() => {
    vi.clearAllMocks()

    app = express()
    app.use(express.json())
    app.use('/api/studio', studioRoutes)
  })

  it('sem chave de IA: erro, nunca texto de exemplo', async () => {
    mocks.chat.mockRejectedValue(Object.assign(new Error('IA indisponível no momento. Fale com seu parceiro.'), { statusCode: 503, code: 'AI_UNAVAILABLE' }))

    const response = await request(app)
      .post('/api/studio/generate-copy')
      .send({
        type: 'headline',
        produto: 'Super Cadeira',
        publico: 'Escritórios modernos',
        objetivo: 'Vender mais',
        tom: 'formal',
        quantidadeVariacoes: 3,
      })

    expect(response.status).not.toBe(200)
    expect(response.body).not.toHaveProperty('variacoes')
  })

  it('should return 400 for invalid body', async () => {
    const response = await request(app)
      .post('/api/studio/generate-copy')
      .send({
        type: 'invalid-type',
        produto: 'a',
        publico: 'b',
        objetivo: 'c',
        tom: 'casual',
        quantidadeVariacoes: 1,
      })

    expect(response.status).toBe(400)
    expect(response.body).toHaveProperty('error')
  })

  it('should generate copy and calculate score', async () => {
    mocks.chat.mockResolvedValue(JSON.stringify({
      variacoes: [
        { texto: 'Compre a cadeira do futuro, hoje.' },
        { texto: 'Ergonomia e design para seu escritório. Saiba mais agora!' },
        { texto: 'Sua coluna agradece. Clique e garanta.' },
      ],
    }))

    const response = await request(app)
      .post('/api/studio/generate-copy')
      .send({
        type: 'descricao',
        produto: 'Super Cadeira Ergonômica',
        publico: 'Profissionais que passam horas sentados',
        objetivo: 'Gerar leads qualificados',
        tom: 'urgente',
        quantidadeVariacoes: 3,
      })

    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('variacoes')
    expect(response.body.variacoes).toHaveLength(3)

    const firstVariation = response.body.variacoes[0]
    expect(firstVariation.texto).toBeDefined()
    expect(typeof firstVariation.texto).toBe('string')
    expect(firstVariation.texto.length).toBeGreaterThan(0)
    expect(firstVariation.caracteres).toBe(firstVariation.texto.length)
    expect(firstVariation.pontuacao).toBeGreaterThan(5)
  })
})
