// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageAttachments } from './MessageAttachments';
import { chatRequest } from './chat-request';
vi.mock('./chat-request', () => ({chatRequest: vi.fn(), mediaError: () => 'Falha ao abrir arquivo'}));

const attachment = {id:'271b73cd-07c8-45db-a271-e3f7b329c026', filename:'foto.png', mimeType:'image/png', sizeBytes:5};
afterEach(() => vi.restoreAllMocks());
describe('mídia privada', () => {
  it('carrega a imagem automaticamente para abri-la diretamente no chat', async () => {
    vi.mocked(chatRequest).mockResolvedValue({blob: async () => new Blob(['image'], {type:'image/png'})} as Response);
    URL.createObjectURL = vi.fn(() => 'blob:private');
    URL.revokeObjectURL = vi.fn();
    render(<MessageAttachments conversationId="conversa" attachments={[attachment]}/>);
    fireEvent.click(await screen.findByRole('button', {name:'Abrir foto.png'}));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
  it('baixa sem abrir o visualizador e usa o endpoint privado', async () => {
    vi.mocked(chatRequest).mockResolvedValue({blob: async () => new Blob(['image'], {type:'image/png'})} as Response);
    URL.createObjectURL = vi.fn(() => 'blob:private');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<MessageAttachments conversationId="conversa" attachments={[attachment]}/>);
    await screen.findByRole('button', {name:'Abrir foto.png'});
    fireEvent.click(screen.getByRole('button', {name:'Baixar foto.png'}));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(chatRequest).toHaveBeenCalledWith('/conversations/conversa/attachments/271b73cd-07c8-45db-a271-e3f7b329c026', expect.any(Object));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('informa falha e permite tentar novamente', async () => {
    vi.mocked(chatRequest).mockRejectedValue(new Error('offline'));
    render(<MessageAttachments conversationId="conversa" attachments={[attachment]}/>);
    fireEvent.click(screen.getByRole('button', {name:'Baixar foto.png'}));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect((screen.getByRole('button', {name:'Baixar foto.png'}) as HTMLButtonElement).disabled).toBe(false);
  });
});
