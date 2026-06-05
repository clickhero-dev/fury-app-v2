import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import studioRoutes from '../routes/studio.routes'

const mocks = vi.hoisted(() => ({
  chatCreate: vi.fn(),
}))

vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mocks.chatCreate,
        },
      },
    })),
  }
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

  it('should return fallback variations when OPENAI_API_KEY is not set', async () => {
    delete process.env.OPENAI_API_KEY

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

    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('variacoes')
    expect(response.body.variacoes).toHaveLength(3)
    expect(response.body.variacoes[0].texto).toContain('Super Cadeira')
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
    process.env.OPENAI_API_KEY = 'fake-key'

    mocks.chatCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              variacoes: [
                { texto: 'Compre a cadeira do futuro, hoje.' },
                { texto: 'Ergonomia e design para seu escritório. Saiba mais agora!' },
                { texto: 'Sua coluna agradece. Clique e garanta.' },
              ],
            }),
          },
        },
      ],
    })

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
