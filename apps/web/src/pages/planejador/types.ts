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
  dayIndex: number;
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
  currentAgent: string;
  agentProgress: AgentStep[];
  planId?: string;
  error?: string;
}

export type ViewState = 'idle' | 'generating' | 'review' | 'confirmed';
