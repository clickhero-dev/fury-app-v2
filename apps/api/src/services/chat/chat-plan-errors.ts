/** Only known public action codes may become client-visible messages. Never relay provider error payloads. */
export const chatPlanActionErrors = {
    VIDEO_NOT_IN_PLAN: 'Seu plano não inclui criação de vídeo.',
    VIDEO_QUOTA_EXCEEDED: 'Sua cota de vídeos está esgotada neste período.',
    MODIFICATION_QUOTA_EXCEEDED: 'A cota de alterações desta mídia está esgotada.',
    SERVICE_BLOCKED: 'Recurso não disponível para sua conta.',
} as const;
export type ChatPlanActionErrorCode = keyof typeof chatPlanActionErrors;
export function chatPlanActionErrorCode(value: unknown): ChatPlanActionErrorCode | undefined {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(chatPlanActionErrors, value) ? value as ChatPlanActionErrorCode : undefined;
}
