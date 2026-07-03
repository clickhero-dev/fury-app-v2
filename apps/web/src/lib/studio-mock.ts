import type { StudioAsset } from '../types/studio';

/**
 * Assets fictícios do Estúdio Criativo para desenvolvimento e testes.
 *
 * Cobre todos os tipos de asset (`image`, `copy`, `video`) e todos os
 * status de compliance (`approved`, `pending`, `pending_compliance`, `rejected`),
 * permitindo testar todos os estados da UI sem depender da API real.
 *
 * Imagens usam o serviço Picsum Photos para URLs válidas em desenvolvimento.
 */
export const MOCK_ASSETS: StudioAsset[] = [
  {
    id: '1',
    type: 'image',
    url: 'https://picsum.photos/400/400?1',
    complianceStatus: 'approved',
    name: 'Criativo Verão 1',
  },
  {
    id: '2',
    type: 'image',
    url: 'https://picsum.photos/400/400?2',
    complianceStatus: 'pending_compliance',
    name: 'Criativo Verão 2',
  },
  {
    id: '3',
    type: 'copy',
    url: null,
    complianceStatus: 'approved',
    name: 'Copy Black Friday',
  },
  {
    id: '4',
    type: 'video',
    url: 'https://picsum.photos/400/400?3',
    complianceStatus: 'pending',
    name: 'Vídeo Promoção',
  },
  {
    id: '5',
    type: 'image',
    url: 'https://picsum.photos/400/400?4',
    complianceStatus: 'rejected',
    name: 'Criativo Rejeitado',
  },
];