export interface StudioAsset {
  id: string;
  type: 'image' | 'copy' | 'video';
  url: string | null;
  compliance_status: 'pending' | 'approved' | 'rejected';
  name: string;
  createdAt?: string;
  description?: string;
}

export interface GenerateImagePayload {
  prompt: string;
  format: 'feed' | 'stories' | 'banner';
  style: 'photographic' | 'illustration' | 'minimalist';
}

export interface GenerateImageResponse {
  id: string;
  url: string;
  format: string;
  style: string;
  prompt: string;
  createdAt: string;
}

export interface CopyVariacao {
  texto: string;
  caracteres: number;
  pontuacao: number;
}

export type CopyType = 'headline' | 'descricao' | 'cta' | 'completo';
export type CopyTone = 'formal' | 'casual' | 'urgente' | 'emocional';

export interface GenerateCopyPayload {
  type: CopyType;
  produto: string;
  publico: string;
  objetivo: string;
  tom: CopyTone;
  quantidadeVariacoes: 3 | 4 | 5;
}

export interface GenerateCopyResponse {
  variacoes: CopyVariacao[];
}
