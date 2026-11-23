import { z } from 'zod';

export const chatCapabilitySchema = z.enum([
  'read_brand', 'read_calendar', 'read_campaigns', 'draft_text',
  'propose_image', 'propose_video', 'propose_post', 'propose_campaign', 'manual',
]);
export type ChatCapability = z.infer<typeof chatCapabilitySchema>;
export const chatPlanStatusSchema = z.enum(['draft', 'running', 'paused', 'waiting_approval', 'completed', 'failed', 'cancelled']);
export const chatPlanTaskStatusSchema = z.enum(['pending', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled']);

const planTaskInputSchema = z.object({
  key: z.string().min(1), title: z.string().min(1), capability: chatCapabilitySchema,
  parameters: z.record(z.unknown()), dependsOn: z.array(z.string()),
});
export type PlanTaskInput = z.infer<typeof planTaskInputSchema>;
const chatPlanTaskSchema = planTaskInputSchema.extend({
  id: z.string().min(1), status: chatPlanTaskStatusSchema,
  result: z.object({
    summary: z.string().optional(), text: z.string().optional(),
    reference: z.object({ kind: z.string(), id: z.string() }).optional(),
  }).passthrough().nullish(),
  error: z.string().nullish(), approvalId: z.string().nullish(),
});
export type ChatPlanTask = z.infer<typeof chatPlanTaskSchema>;
export const chatPlanSchema = z.object({
  id: z.string().min(1), conversationId: z.string().min(1),
  title: z.string().min(1), goal: z.string().min(1), status: chatPlanStatusSchema,
  version: z.number().int().positive(), tasks: z.array(chatPlanTaskSchema).min(1).max(20),
  createdAt: z.string(), updatedAt: z.string(),
});
export type ChatPlan = z.infer<typeof chatPlanSchema>;
export type ChatPlanAction = 'approve' | 'pause' | 'resume' | 'cancel';
export type ChatPlanEdit = { version: number; title?: string; goal?: string; tasks?: PlanTaskInput[] };
export const chatPlansResponseSchema = z.object({ plans: z.array(chatPlanSchema) });
export const chatPlanResponseSchema = z.object({ plan: chatPlanSchema });

export const chatPlanStatusLabels: Record<ChatPlan['status'], string> = {
  draft: 'Pronto para revisar', running: 'Em andamento', paused: 'Plano pausado',
  waiting_approval: 'Aguardando sua aprovação', completed: 'Plano concluído',
  failed: 'Precisa de atenção', cancelled: 'Restantes canceladas',
};
export const chatPlanTaskStatusLabels: Record<ChatPlanTask['status'], string> = {
  pending: 'A fazer', running: 'Em andamento', waiting_approval: 'Aguardando sua aprovação',
  completed: 'Concluída', failed: 'Não concluída', cancelled: 'Cancelada',
};

export function isChatPlanActive(plan: ChatPlan): boolean {
  return plan.status === 'running' || plan.status === 'waiting_approval';
}

export function canCompleteManualTask(plan: ChatPlan, task: ChatPlanTask): boolean {
  return isChatPlanActive(plan) && task.capability === 'manual'
    && (task.status === 'pending' || task.status === 'waiting_approval')
    && task.dependsOn.every(key => plan.tasks.some(dependency => dependency.key === key && dependency.status === 'completed'));
}

/** Never display arbitrary API/provider exception text. Task errors are sanitized server DTO fields. */
export function chatPlanError(error: unknown, operation: 'load' | 'update'): string {
  const status = (error as { status?: number } | null)?.status;
  if (status === 400 || status === 422) return 'Confira os dados do plano e tente novamente.';
  if (status === 401) return 'Sua sessão expirou. Entre novamente para continuar.';
  if (status === 403) return 'Você não tem permissão para alterar este plano.';
  if (status === 404) return 'Este plano ou conversa não está mais disponível. Atualize a conversa.';
  if (status === 409) return 'O plano mudou. Revise a versão atual antes de tentar novamente.';
  if (status === 429) return 'Muitas tentativas. Aguarde um pouco e tente novamente.';
  if ((error as { name?: string } | null)?.name === 'TimeoutError') {
    return 'A resposta demorou mais que o esperado. Atualize o plano para conferir o resultado antes de tentar novamente.';
  }
  return operation === 'load'
    ? 'Não foi possível carregar os planos. Tente atualizar novamente.'
    : 'Não foi possível atualizar o plano. O último estado conhecido foi mantido; atualize para conferir antes de tentar novamente.';
}
