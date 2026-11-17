import { describe, it, expect, vi } from 'vitest';
import { AppError } from '../middleware/errorHandler.js';
import { parseTemplatePlan } from '../services/studio/template-prompt.js';
import { analyzeTemplate } from '../services/studio/template-analysis.js';

const plan = { layout: 'fundo liso', palette: [], typography: 'sans', blocks: [{ position: 'topo', original: 'Olá', kind: 'generic', new_text: 'Olá' }] };
const options = { text: 'dado privado', imageUrls: ['https://private/image'] };

describe('Dado o contrato de análise do modelo', () => {
  it.each([JSON.stringify(plan), '```json\n' + JSON.stringify(plan) + '\n```'])('Quando a saída é válida, então aceita o plano', (raw) => {
    expect(parseTemplatePlan(raw).blocks).toHaveLength(1);
  });
  it.each([[null, 'unexpected_type'], [[], 'unexpected_type'], ['', 'empty'], ['  ', 'empty'], ['segredo', 'invalid_json'], ['{}', 'invalid_schema']])('Quando recebe %j, então rejeita com motivo seguro', (raw, reason) => {
    try { parseTemplatePlan(raw as any); throw new Error('aceitou'); } catch (err) {
      expect(err).toMatchObject({ code: 'TEMPLATE_ANALYSIS_INVALID', details: { reason } });
      expect(JSON.stringify(err)).not.toContain('segredo');
    }
  });
  it.each([{ ...plan, layout: '   ' }, { ...plan, blocks: [{ ...plan.blocks[0], position: '  ' }] }])('Quando campos obrigatórios só têm espaços, então rejeita antes de sanitizar', (value) => {
    expect(() => parseTemplatePlan(JSON.stringify(value))).toThrow('Não foi possível interpretar');
  });
  it('Quando há falha transitória seguida de sucesso, então recupera uma vez e registra apenas metadados', async () => {
    const call = vi.fn().mockRejectedValueOnce(new AppError(502, 'OPENROUTER_CHAT_ERROR', 'privado', { retryable: true })).mockResolvedValue({ content: JSON.stringify(plan), costUsd: 0.01 });
    const emit = vi.fn();
    await analyzeTemplate(call, options, emit, async () => {});
    expect(call).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalledWith('studio_template_analysis', expect.objectContaining({ outcome: 'recovered', attempts: 2, environment: expect.any(String), model: expect.any(String) }));
    expect(JSON.stringify(emit.mock.calls)).not.toMatch(/privado|private/);
  });
  it.each([new AppError(502, 'OPENROUTER_CHAT_ERROR', 'segredo', { retryable: false }), new Error('segredo')])('Quando a falha é permanente ou desconhecida, então não repete', async (error) => {
    const call = vi.fn().mockRejectedValue(error);
    await expect(analyzeTemplate(call, options, vi.fn(), async () => {})).rejects.toMatchObject({ code: 'TEMPLATE_ANALYSIS_UNAVAILABLE' });
    expect(call).toHaveBeenCalledTimes(1);
  });
  it('Quando faltam créditos, então preserva a orientação segura sem retry', async () => {
    const error = new AppError(402, 'OPENROUTER_INSUFFICIENT_CREDITS', 'Saldo insuficiente.');
    const call = vi.fn().mockRejectedValue(error);
    await expect(analyzeTemplate(call, options, vi.fn(), async () => {})).rejects.toBe(error);
    expect(call).toHaveBeenCalledTimes(1);
  });
  it('Quando o timeout persiste, então encerra em duas tentativas com erro seguro', async () => {
    const call = vi.fn().mockRejectedValue(new AppError(504, 'OPENROUTER_CHAT_TIMEOUT', 'segredo', { retryable: true }));
    const emit = vi.fn();
    await expect(analyzeTemplate(call, options, emit, async () => {})).rejects.toMatchObject({ code: 'TEMPLATE_ANALYSIS_UNAVAILABLE' });
    expect(call).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalledWith('studio_template_analysis', expect.objectContaining({ outcome: 'failed', failureReason: 'timeout', attempts: 2 }));
  });
  it('Quando o schema é inválido, então não repete e conta a falha final', async () => {
    const call = vi.fn().mockResolvedValue({ content: '{}', costUsd: 0 });
    const emit = vi.fn();
    await expect(analyzeTemplate(call, options, emit, async () => {})).rejects.toMatchObject({ code: 'TEMPLATE_ANALYSIS_INVALID' });
    expect(call).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('studio_template_analysis', expect.objectContaining({ outcome: 'failed', failureReason: 'invalid_schema' }));
  });
});
