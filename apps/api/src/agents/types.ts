export interface AgentContext {
  tenantId: string;
  tenant: { name: string; businessContext?: string; slug: string };
  brandKit?: { logoUrl?: string; primaryColor?: string; secondaryColor?: string; voiceTone?: string };
  goals?: { objective?: string; niche?: string; mainProduct?: string; targetAudience?: Record<string, any> };
}

export interface ResearchOutput { trends: string[]; holidays: { name: string; day: number }[]; nicheTopics: string[]; }
export interface AnalyticsOutput { bestFormats: string[]; bestDays: string[]; engagementTips: string[]; }
export interface StrategyOutput { objective: string; contentPillars: { name: string; ratio: number }[]; toneGuidelines: string; targetAudience: string; }
export interface PlannerOutput { totalPosts: number; summary: { reelsCount: number; carouselCount: number; imageCount: number; storiesCount: number; }; posts: PlannerPost[]; }
export interface PlannerPost { dayIndex: number; postType: 'reel' | 'carousel' | 'image' | 'stories'; platform: 'instagram' | 'facebook' | 'both'; title: string; contentPillar: string; category: 'engagement' | 'educational' | 'sales' | 'entertainment'; }
export interface CopywriterOutput { posts: CopyPost[]; }
export interface CopyPost { dayIndex: number; caption: string; cta: string; hashtags: string[]; }
export interface CreativeOutput { posts: CreativePost[]; }
export interface CreativePost { dayIndex: number; imagePrompt: string; }
export interface QualityOutput { passed: boolean; checks: { name: string; passed: boolean; message?: string }[]; failedItem?: { agent: string; reason: string }; }
export interface SchedulerOutput { scheduled: { dayIndex: number; platform: string }[]; approvalStatus: 'pending' | 'approved'; }
export interface BrandingOutput { approved: boolean; notes?: string; violations?: string[]; }

export type AgentStepStatus = 'pending' | 'running' | 'completed' | 'failed';
export interface AgentStep { name: string; status: AgentStepStatus; pct: number; }
export interface JobStatus { id: string; tenantId: string; status: 'pending' | 'running' | 'generating' | 'done' | 'error'; currentAgent: string; agentProgress: AgentStep[]; planId?: string; error?: string; }

export interface PipelineState {
  tenantId: string; context: AgentContext; research: ResearchOutput | null; analytics: AnalyticsOutput | null;
  strategy: StrategyOutput | null; planner: PlannerOutput | null; copywriter: CopywriterOutput | null;
  creative: CreativeOutput | null; quality: QualityOutput | null; scheduler: SchedulerOutput | null;
  branding: BrandingOutput | null; planId?: string; error?: string;
}
