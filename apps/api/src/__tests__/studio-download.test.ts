import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const findAssetById = vi.hoisted(() => vi.fn());
const externalFetch = vi.hoisted(() => vi.fn());

vi.mock('../repository/studio.repository.js', () => ({
  StudioRepository: class {
    findAssetById = findAssetById;
  },
}));

vi.mock('../lib/http-client.js', () => ({
  externalFetch,
}));

import { downloadStudioAsset } from '../services/studio/studio.service.js';

const imageAsset = {
  id: 'asset-image-1',
  type: 'image',
  url: 'https://cdn.example.test/final-image.png',
  complianceStatus: 'approved',
  archivedAt: null,
  rootAssetId: null,
};

const videoAsset = {
  id: 'asset-video-1',
  type: 'video',
  url: 'https://cdn.example.test/final-video.mp4',
  complianceStatus: 'approved',
  archivedAt: null,
  rootAssetId: null,
};

function response(body: string, contentType: string, ok = true) {
  return {
    ok,
    status: ok ? 200 : 404,
    headers: new Headers({ 'content-type': contentType }),
    arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode(body).buffer),
  };
}

describe('downloadStudioAsset', () => {
  beforeEach(() => {
    findAssetById.mockReset();
    externalFetch.mockReset();
  });

  afterEach(() => vi.restoreAllMocks());

  /**
   * Funcionalidade: baixar criativos da Biblioteca do Estúdio
   * Cenário: usuário autenticado baixa o arquivo final de imagem ou vídeo
   * Dado que o asset pertence ao tenant e está disponível
   * Quando o backend busca a URL final
   * Então devolve os bytes, o content type e um nome coerente com o tipo
   */
  it('devolve imagem final com nome e tipo seguros', async () => {
    findAssetById.mockResolvedValue(imageAsset);
    externalFetch.mockResolvedValue(response('image-final', 'image/png'));

    await expect(downloadStudioAsset({ tenantId: 'tenant-1', assetId: imageAsset.id })).resolves.toMatchObject({
      body: Buffer.from('image-final'),
      contentType: 'image/png',
      filename: 'criativo-asset-image-1.png',
    });
    expect(externalFetch).toHaveBeenCalledWith(imageAsset.url);
  });

  it('devolve vídeo final com extensão de vídeo', async () => {
    findAssetById.mockResolvedValue(videoAsset);
    externalFetch.mockResolvedValue(response('video-final', 'video/mp4'));

    await expect(downloadStudioAsset({ tenantId: 'tenant-1', assetId: videoAsset.id })).resolves.toMatchObject({
      body: Buffer.from('video-final'),
      contentType: 'video/mp4',
      filename: 'criativo-asset-video-1.mp4',
    });
  });

  it('permite baixar arquivo final enquanto a análise de compliance está pendente', async () => {
    findAssetById.mockResolvedValue({ ...imageAsset, complianceStatus: 'pending_compliance' });
    externalFetch.mockResolvedValue(response('image-final', 'image/png'));

    await expect(downloadStudioAsset({ tenantId: 'tenant-1', assetId: imageAsset.id })).resolves.toMatchObject({
      filename: 'criativo-asset-image-1.png',
    });
  });

  it('rejeita asset inexistente, arquivado ou ainda processando sem buscar URL', async () => {
    findAssetById.mockResolvedValueOnce(null);
    await expect(downloadStudioAsset({ tenantId: 'tenant-1', assetId: 'missing' })).rejects.toMatchObject({ statusCode: 404 });

    findAssetById.mockResolvedValueOnce({ ...imageAsset, archivedAt: new Date() });
    await expect(downloadStudioAsset({ tenantId: 'tenant-1', assetId: imageAsset.id })).rejects.toMatchObject({ statusCode: 404 });

    findAssetById.mockResolvedValueOnce({ ...imageAsset, complianceStatus: 'pending' });
    await expect(downloadStudioAsset({ tenantId: 'tenant-1', assetId: imageAsset.id })).rejects.toMatchObject({ statusCode: 409 });
    expect(externalFetch).not.toHaveBeenCalled();
  });

  it('converte URL expirada, content type inválido e erro de rede em erros client-safe', async () => {
    findAssetById.mockResolvedValue(imageAsset);
    externalFetch.mockResolvedValue(response('gone', 'text/html', false));
    await expect(downloadStudioAsset({ tenantId: 'tenant-1', assetId: imageAsset.id })).rejects.toMatchObject({ statusCode: 502 });

    externalFetch.mockResolvedValue(response('html', 'text/html'));
    await expect(downloadStudioAsset({ tenantId: 'tenant-1', assetId: imageAsset.id })).rejects.toMatchObject({ statusCode: 400 });

    externalFetch.mockRejectedValue(new Error('private provider details'));
    await expect(downloadStudioAsset({ tenantId: 'tenant-1', assetId: imageAsset.id })).rejects.toMatchObject({ statusCode: 502 });
  });
});
