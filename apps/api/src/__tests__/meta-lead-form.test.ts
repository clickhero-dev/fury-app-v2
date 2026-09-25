import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as metaApi from '../lib/meta-api.js';

/**
 * COBERTURA do `campaignHasLeadForm` — a detecção de "campanha tem formulário"
 * depende de ler o criativo do ad e extrair `lead_gen_form_id` de uma estrutura
 * aninhada (`creative.link_data.call_to_action.value` ou
 * `object_story_spec.link_data.call_to_action.value`). Esse parsing é o ponto
 * frágil contra a resposta real da Graph API, então é testado isoladamente.
 *
 * `metaApiCall` usa `fetch` internamente (binding local), por isso mockamos a
 * camada HTTP (`globalThis.fetch`) em vez de espionar a exportação.
 */
describe('metaApi.campaignHasLeadForm (detecção de campanha com formulário)', () => {
  beforeEach(() => {
    delete process.env.META_API_MOCK; // garante caminho real (fetch)
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.META_API_MOCK;
  });

  function mockFetch(body: unknown) {
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => body,
    } as unknown as Response);
  }

  it('true quando um ad tem lead_gen_form_id em creative.link_data', async () => {
    const spy = mockFetch({
      data: [
        { id: 'ad_1', creative: { link_data: { call_to_action: { value: { lead_gen_form_id: 'form_1' } } } } },
      ],
    });

    await expect(metaApi.campaignHasLeadForm('campaign_1', 'tok')).resolves.toBe(true);
    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain('/campaign_1/ads');
    // Buscamos link_data/object_story_spec COMPLETOS, sem subcampo aninhado
    // (call_to_action{value}) — que a Graph API pode rejeitar.
    expect(url).toContain('creative%7Blink_data%2Cobject_story_spec%7D'); // creative{link_data,object_story_spec}
    expect(url).not.toContain('call_to_action%7Bvalue%7D'); // call_to_action{value}
  });

  it('true quando o form está em object_story_spec.link_data (fallback)', async () => {
    mockFetch({
      data: [
        { id: 'ad_2', creative: { object_story_spec: { link_data: { call_to_action: { value: { lead_gen_form_id: 'form_2' } } } } } },
      ],
    });

    await expect(metaApi.campaignHasLeadForm('campaign_2', 'tok')).resolves.toBe(true);
  });

  it('true quando só um dos vários ads referencia form', async () => {
    mockFetch({
      data: [
        { id: 'ad_sem', creative: { link_data: { call_to_action: { value: {} } } } },
        { id: 'ad_com', creative: { link_data: { call_to_action: { value: { lead_gen_form_id: 'form_x' } } } } },
      ],
    });

    await expect(metaApi.campaignHasLeadForm('campaign_3', 'tok')).resolves.toBe(true);
  });

  it('false quando nenhum ad referencia formulário (ou sem criativo/CTA)', async () => {
    mockFetch({
      data: [
        { id: 'ad_4', creative: { link_data: { call_to_action: { value: {} } } } },
        { id: 'ad_5', creative: {} },
      ],
    });

    await expect(metaApi.campaignHasLeadForm('campaign_4', 'tok')).resolves.toBe(false);
  });

  it('segue paginação e retorna false ao fim das páginas sem form', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: 'ad_a', creative: { link_data: { call_to_action: { value: {} } } } }],
          paging: { cursors: { after: 'next_cursor' } },
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: 'ad_b', creative: { link_data: { call_to_action: { value: {} } } } }],
        }),
      } as unknown as Response);

    await expect(metaApi.campaignHasLeadForm('campaign_5', 'tok')).resolves.toBe(false);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1][0]).toContain('after=next_cursor');
  });
});
