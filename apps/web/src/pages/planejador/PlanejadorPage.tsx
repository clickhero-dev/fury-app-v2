import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Sparkles, Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import { IdleStatus } from './components/IdleStatus';
import { GeneratingState } from './components/GeneratingState';
import { PlanSummary } from './components/PlanSummary';
import { CalendarView } from './components/CalendarView';

type ViewState = 'idle' | 'generating' | 'summary' | 'calendar';

export interface Plan {
  id: string;
  title: string;
  objective: string;
  totalPosts: number;
  metadata: { summary?: { reelsCount?: number; carouselCount?: number; imageCount?: number; storiesCount?: number } };
  posts: Post[];
}

export interface Post {
  id: string;
  dayIndex: number;
  postType: 'reel' | 'carousel' | 'image' | 'stories';
  platform: string;
  title: string;
  caption: string;
  cta: string;
  hashtags: string[];
  imagePrompt: string;
  status: string;
}

export function PlanejadorPage() {
  const [view, setView] = useState<ViewState>('idle');
  const [plan, setPlan] = useState<Plan | null>(null);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/planner/generate');
      return data as { jobId: string };
    },
    onSuccess: (data) => {
      setView('generating');
      startPolling(data.jobId);
    },
  });

  const startPolling = (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const { data } = await api.get(`/planner/jobs/${jobId}`);
        if (data.status === 'done') {
          clearInterval(interval);
          // fetch the plan
          const planRes = await api.get(`/planner/plans/${data.planId}`);
          setPlan(planRes.data as Plan);
          setView('summary');
        } else if (data.status === 'error') {
          clearInterval(interval);
          // volta pra idle com erro
          setView('idle');
        }
      } catch {
        clearInterval(interval);
        setView('idle');
      }
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-[#111827]">
      {view === 'idle' && (
        <IdleStatus
          onGenerate={() => generateMutation.mutate()}
          isLoading={generateMutation.isPending}
        />
      )}
      {view === 'generating' && <GeneratingState />}
      {view === 'summary' && plan && (
        <PlanSummary plan={plan} onViewCalendar={() => setView('calendar')} />
      )}
      {view === 'calendar' && plan && (
        <CalendarView plan={plan} />
      )}
    </div>
  );
}
