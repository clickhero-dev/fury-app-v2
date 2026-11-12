export interface ChatAction {
  approvalId: string;
  userId: string;
  tenantId: string;
  method: string;
  path: string;
  body: unknown;
}
export interface ChatApprovalPort { consume(action: ChatAction): Promise<boolean>; complete?(approvalId: string, userId: string): Promise<void>; fail?(approvalId: string, userId: string): Promise<void>; unknown?(approvalId: string, userId: string): Promise<void> }
export async function authorizeChatAction(action: ChatAction, repository: ChatApprovalPort): Promise<boolean> {
  return repository.consume(action);
}
