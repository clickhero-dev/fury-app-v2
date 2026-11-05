export interface Plan {
  id: string;
  title: string;
  objective: string;
  totalPosts: number;
  metadata: {
    summary?: { carouselCount?: number; imageCount?: number; storiesCount?: number };
    research?: any;
    analytics?: any;
    strategy?: any;
    quality?: any;
    branding?: { approved?: boolean; notes?: string; violations?: string[] };
  };
  status: string;
  periodStart: string;
  periodEnd: string;
  posts: Post[];
  createdAt: string;
}

export interface Post {
  id: string;
  planId: string;
  platform: string;
  postType: string;
  title?: string;
  caption?: string;
  cta?: string;
  hashtags?: string[];
  imagePrompt?: string;
  imageUrl?: string;        // Single image (reel, image, stories) - legacy/compat
  imageUrls?: string[];     // Multiple images for carousel (max 5)
  compliance?: { status: string | null; notes: string | null } | null;
  dayIndex: number;
  date: string; // Fase 5: ISO date string (ex: "2026-08-19") — sempre presente da API
  status: string;
  scheduledAt?: string;
}

export interface AgentStep {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  pct: number;
}

export interface JobStatus {
  id: string;
  status: 'pending' | 'running' | 'generating' | 'done' | 'error';
  state: 'INITIALIZING' | 'WORKING' | 'DONE' | 'ERROR';
  currentAgent: string;
  agentProgress: AgentStep[];
  planId?: string;
  error?: string;
}

export type ViewState = 'idle' | 'generating' | 'review' | 'confirmed';
