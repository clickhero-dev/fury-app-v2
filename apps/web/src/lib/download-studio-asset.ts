import api from './api';

function filenameFromDisposition(disposition: unknown, assetId: string): string {
  const value = String(disposition ?? '');
  return value.match(/filename="([^"\\]+)"/)?.[1] ?? `criativo-${assetId}`;
}

/** Baixa um asset pelo endpoint autenticado, sem expor a URL do provedor. */
export async function downloadStudioAsset(assetId: string): Promise<void> {
  const response = await api.get(`/studio/assets/${assetId}/download`, { responseType: 'blob' });
  const href = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = href;
  link.download = filenameFromDisposition(response.headers?.['content-disposition'], assetId);
  link.click();
  URL.revokeObjectURL(href);
}
