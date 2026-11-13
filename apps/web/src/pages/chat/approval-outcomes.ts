const failureMessages = {
  VIDEO_NOT_IN_PLAN: 'A criação de vídeos não está disponível no seu plano atual.',
  VIDEO_QUOTA_EXCEEDED: 'O limite de criação de vídeos deste período foi atingido.',
  MODIFICATION_QUOTA_EXCEEDED: 'O limite de alterações deste vídeo foi atingido.',
  SERVICE_BLOCKED: 'Esta ação não está disponível para sua conta.',
} as const;

export type ApprovalFailure = { code: keyof typeof failureMessages; message: string };

function failureForCode(code: unknown): ApprovalFailure | null {
  if (typeof code !== 'string' || !Object.prototype.hasOwnProperty.call(failureMessages, code)) return null;
  const knownCode = code as ApprovalFailure['code'];
  return { code: knownCode, message: failureMessages[knownCode] };
}

/** Only the server's recorded, classified rejection is a definite failure. */
export function approvalFailureFromResponse(status: number, body: unknown): ApprovalFailure | null {
  if (status !== 403 || !body || typeof body !== 'object' || !('detail' in body)) return null;
  const detail = body.detail;
  if (!detail || typeof detail !== 'object' || !('status' in detail) || detail.status !== 'failed' || !('code' in detail)) return null;
  return failureForCode(detail.code);
}

export function approvalFailureFromResult(status: string, result: unknown): ApprovalFailure | null {
  if (status !== 'failed' || !result || typeof result !== 'object' || !('code' in result)) return null;
  const values = result as Record<string, unknown>;
  if (['jobId', 'job', 'videoUrl', 'imageUrl'].some(key => Boolean(values[key]))) return null;
  return failureForCode(result.code);
}
