import type { StudioAsset } from '../types/studio';

export const MOCK_ASSETS: StudioAsset[] = [
  {
    id: '1',
    type: 'image',
    url: 'https://picsum.photos/400/400?1',
    compliance_status: 'approved',
    name: 'Criativo Verão 1',
  },
  {
    id: '2',
    type: 'image',
    url: 'https://picsum.photos/400/400?2',
    compliance_status: 'pending',
    name: 'Criativo Verão 2',
  },
  {
    id: '3',
    type: 'copy',
    url: null,
    compliance_status: 'approved',
    name: 'Copy Black Friday',
  },
];
