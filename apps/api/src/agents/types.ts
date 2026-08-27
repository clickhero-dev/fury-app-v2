export interface AgentContext {
  tenantId: string;
  tenant: { name: string; businessContext?: string; slug: string };
  brandKit?: { logoUrl?: string; primaryColor?: string; secondaryColor?: string; voiceTone?: string };
  goals?: { objective?: string; niche?: string; mainProduct?: string; targetAudience?: Record<string, any> };
}

export type AgentStepStatus = 'pending' | 'running' | 'completed' | 'failed';
export interface AgentStep {
  name: string;
  status: AgentStepStatus;
  pct: number;
}

export interface JobStatus {
  id: string;
  tenantId: string;
  status: 'pending' | 'running' | 'generating' | 'awaiting_images' | 'done' | 'error';
  currentAgent: string;
  agentProgress: AgentStep[];
  planId?: string;
  error?: string;
  _recoverable?: boolean;
}

/**
 * Contexto consolidado da empresa usado pelos agentes langchain do planejador.
 * Une brandKit (tom/cor/logo) + clientGoals (nicho/produto) + cidade.
 */
export interface PlannerContext {
  tenantId: string;
  businessName: string;
  brandKit?: {
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    voiceTone?: string;
  };
  goals?: {
    objective?: string;
    niche?: string;
    mainProduct?: string;
  };
  city?: string;
}

/** Item de conteúdo retornado pela IA (shape achatado — sem datas/enums). */
export interface PlannerContentItem {
  title: string;
  descricao: string;
  prompt: string;
}

/**
 * Prompt de post estruturado produzido pelo planejador.
 * Data/postType/platform/cta/hashtags são derivados no código (determinísticos);
 * o conteúdo (title/caption/imagePrompt) vem da IA.
 * É consumido pela fila studio-generate-image (modo planner).
 */
export interface PlannerPrompt {
  date: string; // ISO 'YYYY-MM-DD' → calendar_date
  title: string;
  caption: string;
  cta: string;
  hashtags: string[];
  imagePrompt: string;
  postType: 'image' | 'carousel' | 'reel' | 'stories';
  platform: 'instagram' | 'facebook' | 'both';
}

export interface PlannerPromptsOutput {
  posts: PlannerContentItem[];
}