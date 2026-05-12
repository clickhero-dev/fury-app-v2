import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import studioRoutes from '../routes/studio.routes'

// Mocking dependencies
vi.mock('../lib/claude', () => ({
  claude: {
    model: 'claude-sonnet-4-20250514',
    messages: {
      create: vi.fn(),
    },
  },
}))

vi.mock('db', () => ({
  db: {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockImplementation(() => ({
      then: (cb) => cb(),
    })),
  },
}))

describe('POST /api/studio/generate-copy', () => {
  let app

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    // Re-import claude to be able to mock it in tests
    const { claude } = require('../lib/claude')

    app = express()
    app.use(express.json())
    // Mock middlewares
    app.use((req: any, res, next) => {
      req.user = { id: 'test-user-id' }
      req.tenant = { tenantId: 'test-tenant-id' }
      next()
    })
    app.use('/api/studio', studioRoutes)
  })

  it('should return fallback variations when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY

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
    expect(response.body.variacoes.length).toBe(3)
    expect(response.body.variacoes[0].texto).toContain('Super Cadeira')
  })

  it('should return 400 for invalid body', async () => {
    const response = await request(app)
      .post('/api/studio/generate-copy')
      .send({
        type: 'invalid-type', // Invalid enum value
        produto: 'a', // Too short
        publico: 'b', // Too short
        objetivo: 'c', // Too short
        tom: 'casual',
        quantidadeVariacoes: 1, // Too few
      })

    expect(response.status).toBe(400)
    expect(response.body).toHaveProperty('error')
  })

  it('should generate copy, calculate score, and save to db', async () => {
    process.env.ANTHROPIC_API_KEY = 'fake-key'

    const { claude } = require('../lib/claude')
    const { db } = require('db')

    const mockApiResponse = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            variacoes: [
              { texto: 'Compre a cadeira do futuro, hoje.', caracteres: 0 },
              {
                texto:
                  'Ergonomia e design para seu escritório. Saiba mais agora!',
                caracteres: 0,
              },
              { texto: 'Sua coluna agradece. Clique e garanta.', caracteres: 0 },
            ],
          }),
        },
      ],
    }
    claude.messages.create.mockResolvedValue(mockApiResponse)

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
    expect(response.body.variacoes.length).toBe(3)

    // Check if scoring and character count is working
    const firstVariation = response.body.variacoes[0]
    expect(firstVariation.texto).toBe('Compre a cadeira do futuro, hoje.')
    expect(firstVariation.caracteres).toBe(33)
    expect(firstVariation.pontuacao).toBeGreaterThan(5) // Should have points for CTA and length

    // Check if it was "saved" to the DB
    expect(db.insert).toHaveBeenCalled()
  })
})
