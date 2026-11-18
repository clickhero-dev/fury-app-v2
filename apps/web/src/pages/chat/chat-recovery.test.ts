import { describe, expect, it, vi } from 'vitest';
import { cancelChatRun, isRecoveryPending, recoveryState } from './chat-recovery';
import { chatRequest } from './chat-request';
vi.mock('./chat-request', () => ({chatRequest:vi.fn()}));
describe('Contrato público de recuperação',()=>{
  it.each([['queued','recovering',true],['running','running',true],['cancelled','cancelled',false],['completed','completed',false],['stopped','failed',false],['exhausted','failed',false]])('traduz %s sem reenviar prompt', (status,expected,pending)=>{
    expect(recoveryState({status})).toBe(expected);
    expect(isRecoveryPending({status})).toBe(pending);
  });
  it.each([null,{}, {status:'secret'}, 'queued'])('não inventa status para %j',data=>{
    expect(recoveryState(data)).toBeNull();
    expect(isRecoveryPending(data)).toBe(false);
  });
  it('cancela somente run informado e exige confirmação exata de cancelamento',async()=>{
    vi.mocked(chatRequest).mockResolvedValueOnce(new Response('{"status":"cancelled"}'));
    expect(await cancelChatRun('conv','run')).toBe('cancelled');
    expect(chatRequest).toHaveBeenCalledWith('/conversations/conv/runs/run/cancel',{method:'POST',body:'{}'});
    vi.mocked(chatRequest).mockResolvedValueOnce(new Response('{"status":"running"}'));
    await expect(cancelChatRun('conv','run')).rejects.toThrow();
    vi.mocked(chatRequest).mockResolvedValueOnce(new Response('{"status":"completed"}'));
    expect(await cancelChatRun('conv','run')).toBe('completed');
  });
});
