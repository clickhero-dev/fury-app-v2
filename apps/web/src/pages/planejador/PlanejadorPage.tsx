import { useState, useCallback, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AppLayout } from '@/components';
import api from '@/lib/api';
import { IdleStatus } from './components/IdleStatus';
import { GeneratingState } from './components/GeneratingState';
import { PlanSummary } from './components/PlanSummary';
import { CalendarView } from './components/CalendarView';
import type { Plan, Post } from './types';

// ponytail: demo data embutido pra testar sem API
const MOCK_TYPES: Post['postType'][] = ['carousel', 'image', 'stories'];
const MOCK_TITLES = [
  'Antes e depois: resultados reais',
  '3 dicas que ninguém te conta',
  'Promoção imperdível essa semana',
  'O que nossos clientes dizem',
  'Tutorial passo a passo',
  'Conheça nossa equipe',
  'Dica rápida do dia',
  'Case de sucesso: cliente X',
];
const MOCK_STATUS: Post['status'][] = ['draft', 'approved'];

const DAYS_31 = Array.from({ length: 31 }, (_, i) => i + 1);

function buildMockPlan(): Plan {
  const posts: Post[] = [];
  for (let d = 0; d < 16; d++) {
    posts.push({
      id: `mock-${d}`,
      dayIndex: DAYS_31[d % 31],
      postType: MOCK_TYPES[d % 4],
      platform: 'instagram',
      title: MOCK_TITLES[d % MOCK_TITLES.length],
      caption: `Legenda para o post "${MOCK_TITLES[d % MOCK_TITLES.length]}". Conteúdo gerado pela IA para engajar seu público.`,
      cta: d % 2 === 0 ? 'Saiba mais' : 'Garanta já',
      hashtags: ['#marketing', '#resultados', '#dicas'],
      imagePrompt: `Cena mostrando ${MOCK_TITLES[d % MOCK_TITLES.length].toLowerCase()}`,
      status: MOCK_STATUS[d % 2],
    });
  }
  return {
    id: 'mock-plan',
    title: 'Plano de Julho 2026',
    objective: 'Aumentar o engajamento no Instagram em 40%',
    totalPosts: 16,
    metadata: {
      summary: { carouselCount: 6, imageCount: 5, storiesCount: 31 },
    },
    posts,
  };
}

export function PlanejadorPage() {
  const [view, setView] = useState<'idle' | 'generating' | 'summary' | 'calendar'>('idle');
  const [plan, setPlan] = useState<Plan | null>(null);

  // ponytail: carrega plano existente ao montar (se salvou sessionStorage)
  const savedPlanId = sessionStorage.getItem('fury_last_plan_id');
  const { data: savedPlan } = useQuery({
    queryKey: ['planner/plan', savedPlanId],
    queryFn: async () => {
      const { data: res } = await api.get(`/planner/plans/${savedPlanId}`);
      return res.data as Plan;
    },
    enabled: !!savedPlanId,
    retry: 1,
  });
  // ponytail: ?view=calendar pula direto pro calendário se tem plano salvo
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'calendar' && savedPlan) {
      setPlan(savedPlan); setView('calendar');
    } else if (savedPlan) {
      setPlan(savedPlan); setView('calendar');
    }
  }, [savedPlan]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data: res } = await api.post('/planner/generate');
      return { jobId: res.data.jobId };
    },
    onSuccess: (data) => {
      setView('generating');
      startPolling(data.jobId);
    },
    // ponytail: API caiu → demo mode
    onError: () => {
      setView('generating');
      setTimeout(() => { setPlan(buildMockPlan()); setView('summary'); }, 3000);
    },
  });

  const startPolling = (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const { data: res } = await api.get(`/planner/jobs/${jobId}`);
        const job = res.data;
        if (job.status === 'done') {
          clearInterval(interval);
          const { data: planRes } = await api.get(`/planner/plans/${job.planId}`);
          setPlan(planRes.data as Plan);
          sessionStorage.setItem('fury_last_plan_id', job.planId);
          setView('summary');
        } else if (job.status === 'error') {
          clearInterval(interval);
          setView('idle');
        }
      } catch {
        clearInterval(interval);
        setView('idle');
      }
    }, 1500);
  };

  const handleGenerate = useCallback(() => generateMutation.mutate(), [generateMutation]);

  return (
    <AppLayout className={view === 'calendar' ? '!p-0' : undefined}>
      {view === 'idle' && (
        <IdleStatus onGenerate={handleGenerate} isLoading={generateMutation.isPending} />
      )}
      {view === 'generating' && <GeneratingState />}
      {view === 'summary' && plan && (
        <PlanSummary plan={plan} onViewCalendar={() => setView('calendar')} />
      )}
      {view === 'calendar' && plan && (
        <CalendarView plan={plan} onScheduleAll={() => setPlan(prev => prev ? {
          ...prev,
          posts: prev.posts.map(p => ({ ...p, status: 'scheduled' as const })),
        } : null)} />
      )}
    </AppLayout>
  );
}
