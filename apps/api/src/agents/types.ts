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
  status: 'pending' | 'running' | 'generating' | 'done' | 'error';
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

/** Data importante/relevante para a cidade e/ou nicho. */
export interface ImportantDate {
  date: string; // ISO 'YYYY-MM-DD'
  name: string;
  reason?: string;
}

/**
 * Prompt de post estruturado produzido pelo agente langchain.
 * Carrega toda a informação do post + o prompt de geração de imagem,
 * e é consumido pela fila studio-generate-image (modo planner).
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
  posts: PlannerPrompt[];
}