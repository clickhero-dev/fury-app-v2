// @vitest-environment jsdom
/* Funcionalidade: compositor multimídia conectado
 * Cenário: selecionar anexo — Dado um rascunho sem conversa, Quando seleciono, Então crio uma conversa e envio multipart sem enviar mensagem.
 * Cenário: só anexo — Dado upload confirmado, Quando envio, Então envio IDs e preservo metadados após done.
 * Cenário: falha de upload — Dado rascunho com arquivo, Quando upload falha, Então preservo texto/prévia e ofereço nova tentativa.
 * Cenário: colar/soltar — Dado imagens no clipboard/arquivos no drop, Quando adiciono, Então aplico a validação comum.
 * Cenário: ditado — Dado texto digitado, Quando paro o microfone, Então anexo texto revisável sem envio automático.
 * Cenário: trocar conversa — Dado voz/upload pendente, Quando troco, Então preservo o upload e não contamino a nova conversa.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPage } from './ChatPage';
vi.mock('./useChatPlans', () => ({useChatPlans: () => ({
  plans: [], loading: false, refreshing: false, error: null, errors: {}, busyPlanIds: [],
  refetch: vi.fn().mockResolvedValue(undefined), onAction: vi.fn().mockResolvedValue(true),
  onEdit: vi.fn().mockResolvedValue(true), onCompleteTask: vi.fn().mockResolvedValue(true),
})}));
const attachment = {id:'271b73cd-07c8-45db-a271-e3f7b329c026',filename:'foto.png',mimeType:'image/png',sizeBytes:5};
const file = () => new File(['image'],'foto.png',{type:'image/png'});
let fetchMock: ReturnType<typeof vi.fn>;
const stopTrack = vi.fn();
class Recorder {
  static active: Recorder;
  static isTypeSupported = () => true;
  state = 'inactive'; mimeType = 'audio/webm';
  ondataavailable?: (e: {data:Blob}) => void; onstop?: () => void; onerror?: () => void;
  constructor() { Recorder.active = this; }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; queueMicrotask(() => { this.ondataavailable?.({data:new Blob(['voice'],{type:'audio/webm'})}); this.onstop?.(); }); }
}
const json = (data: unknown,status = 200) => new Response(JSON.stringify(data),{status});
const completed = () => new Response('event: done\ndata: {"message":{"content":"Recebi seu arquivo"}}\n\nevent: title\ndata: {"id":"conversation","title":"Arquivo recebido"}\n\n');
beforeEach(() => {
  sessionStorage.clear(); localStorage.setItem('token','test-token');
  URL.createObjectURL = vi.fn(() => 'blob:local'); URL.revokeObjectURL = vi.fn();
  stopTrack.mockClear();
  vi.stubGlobal('MediaRecorder',Recorder);
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:vi.fn().mockResolvedValue({getTracks:() => [{stop:stopTrack,addEventListener:vi.fn(),removeEventListener:vi.fn()}]})}});
  fetchMock = vi.fn(async (url: string,init: RequestInit = {}) => {
    if (url.endsWith('/transcriptions')) return json({text:'Texto ditado'});
    if (url.endsWith('/attachments') && init.method === 'POST') return json({attachments:[attachment]},201);
    if (url.endsWith('/messages')) return completed();
    if (url.endsWith('/conversations')) return init.method === 'POST' ? json({id:'conversation',title:'Nova conversa'}) : json([{id:'other',title:'Outra conversa'}]);
    if (url.endsWith('/conversations/other')) return json({messages:[],approvals:[]});
    if (init.method === 'DELETE') return new Response(null,{status:204});
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch',fetchMock);
});
const requests = (path: string) => fetchMock.mock.calls.filter(([url]) => url.endsWith(path));
async function select() { fireEvent.change(screen.getByLabelText('Selecionar anexos'),{target:{files:[file()]}}); await screen.findByText('Pronto para enviar'); }

describe('ChatPage multimídia', () => {
  it('preserva rascunho inicial após falha e o transfere ao criar nova conversa', async () => {
    const original = fetchMock.getMockImplementation()!;
    let attempts = 0;
    fetchMock.mockImplementation((url, init) => {
      if (url.endsWith('/conversations') && init?.method === 'POST' && ++attempts <= 2) return Promise.resolve(json({}, 500));
      return original(url, init);
    });
    render(<ChatPage/>);
    await screen.findByRole('button', {name:'Outra conversa'});
    fireEvent.change(screen.getByLabelText('Mensagem'), {target:{value:'Rascunho inicial'}});
    fireEvent.change(screen.getByLabelText('Selecionar anexos'), {target:{files:[file()]}});
    await screen.findByRole('button', {name:'Tentar enviar foto.png novamente'});
    fireEvent.click(screen.getByRole('button', {name:'Nova conversa'}));
    await waitFor(() => expect(attempts).toBe(2));
    await screen.findByText('Não foi possível iniciar a conversa.');
    expect((screen.getByLabelText('Mensagem') as HTMLTextAreaElement).value).toBe('Rascunho inicial');
    expect(screen.getByRole('button', {name:'Tentar enviar foto.png novamente'})).toBeTruthy();
    fireEvent.click(screen.getByRole('button', {name:'Nova conversa'}));
    await waitFor(() => expect(sessionStorage.getItem('ady-chat-current')).toBe('conversation'));
    expect((screen.getByLabelText('Mensagem') as HTMLTextAreaElement).value).toBe('Rascunho inicial');
    fireEvent.click(screen.getByRole('button', {name:'Tentar enviar foto.png novamente'}));
    await screen.findByText('Pronto para enviar');
    expect(requests('/attachments')).toHaveLength(1);
    expect(requests('/attachments')[0][0]).toContain('/conversations/conversation/');
  });
  it('aborta criação na saída da página e ignora conversa criada tardiamente', async () => {
    let finish!: (response: Response) => void;
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url,init) => url.endsWith('/conversations') && init?.method === 'POST' ? new Promise(resolve => {finish = resolve;}) : original(url,init));
    const {unmount} = render(<ChatPage/>);
    fireEvent.change(screen.getByLabelText('Selecionar anexos'),{target:{files:[file()]}});
    await waitFor(() => expect(requests('/conversations').filter(([,init]) => init.method === 'POST')).toHaveLength(1));
    const creation = requests('/conversations').find(([,init]) => init.method === 'POST')!;
    unmount();
    expect(creation[1].signal?.aborted).toBe(true);
    await act(async () => finish(json({id:'late',title:'Nova conversa'})));
    expect(sessionStorage.getItem('ady-chat-current')).toBeNull();
    expect(requests('/attachments')).toHaveLength(0);
  });
  it('seleciona imagem, PDF e vídeo juntos, cria uma conversa e envia os três IDs', async () => {
    const original = fetchMock.getMockImplementation()!;
    const files = [file(),new File(['pdf'],'briefing.pdf',{type:'application/pdf'}),new File(['video'],'cena.mp4',{type:'video/mp4'})];
    const ids = ['271b73cd-07c8-45db-a271-e3f7b329c026','271b73cd-07c8-45db-a271-e3f7b329c027','271b73cd-07c8-45db-a271-e3f7b329c028'];
    fetchMock.mockImplementation((url,init) => {
      if (url.endsWith('/attachments')) {
        const uploaded = init.body.get('files') as File;
        const index = files.findIndex(file => file.name === uploaded.name);
        return Promise.resolve(json({attachments:[{id:ids[index],filename:uploaded.name,mimeType:uploaded.type,sizeBytes:uploaded.size}]}));
      }
      return original(url,init);
    });
    render(<ChatPage/>);
    fireEvent.change(screen.getByLabelText('Selecionar anexos'),{target:{files}});
    await waitFor(() => expect(screen.getAllByText('Pronto para enviar')).toHaveLength(3));
    expect(screen.getByLabelText('Prévia de cena.mp4')).toHaveAttribute('controls');
    expect(screen.getByText('briefing.pdf')).toBeInTheDocument();
    expect(requests('/conversations').filter(([,init]) => init.method === 'POST')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
    await screen.findByText('Recebi seu arquivo');
    expect(JSON.parse(requests('/messages')[0][1].body)).toEqual({attachmentIds:ids});
    expect(document.querySelectorAll('.ady-chat-saved-attachment')).toHaveLength(3);
  });
  it('preserva anexo/rascunho se excluir conversa falhar e bloqueia corridas durante exclusão', async () => {
    let finish!: (response: Response) => void;
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url,init) => init?.method === 'DELETE' ? new Promise(resolve => {finish = resolve;}) : original(url,init));
    const confirm = vi.spyOn(window,'confirm').mockReturnValue(true);
    try {
      render(<ChatPage/>); await select();
      fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Rascunho'}});
      fireEvent.keyDown(screen.getByRole('button',{name:'Opções da conversa'}),{key:'ArrowDown'});
      fireEvent.click(await screen.findByRole('menuitem',{name:'Excluir conversa'}));
      expect(screen.getByRole('button',{name:'Enviar mensagem'})).toBeDisabled();
      expect(screen.getByRole('button',{name:'Outra conversa'})).toBeDisabled();
      expect(screen.getByRole('button',{name:'Remover anexo foto.png'})).toBeDisabled();
      await act(async () => finish(json({},500)));
      expect(await screen.findByRole('alert')).toHaveTextContent(/excluir/);
      expect(screen.getByRole('button',{name:'Remover anexo foto.png'})).toBeEnabled();
      expect(screen.getByLabelText('Mensagem')).toHaveValue('Rascunho');
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    } finally { confirm.mockRestore(); }
  });
  it('expõe exclusão desabilitada enquanto há upload pendente', async () => {
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url,init) => url.endsWith('/attachments') ? new Promise(() => {}) : original(url,init));
    render(<ChatPage/>);
    fireEvent.change(screen.getByLabelText('Selecionar anexos'),{target:{files:[file()]}});
    await waitFor(() => expect(requests('/attachments')).toHaveLength(1));
    fireEvent.keyDown(screen.getByRole('button',{name:'Opções da conversa'}),{key:'ArrowDown'});
    expect(await screen.findByRole('menuitem',{name:'Excluir conversa'})).toHaveAttribute('aria-disabled','true');
  });
  it('reconcilia IDs já associados após perder resposta HTTP sem reenviar rascunho', async () => {
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url,init) => {
      if (url.endsWith('/messages')) return Promise.reject(new Error('network lost after commit'));
      if (url.endsWith('/conversations/conversation')) return Promise.resolve(json({messages:[{id:'saved',role:'user',content:'Pergunta',attachments:[attachment]}],response_run:{status:'interrupted'},approvals:[]}));
      return original(url,init);
    });
    render(<ChatPage/>); await select();
    fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Pergunta'}});
    fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
    await screen.findByRole('button',{name:'Retomar resposta'});
    expect(screen.getByLabelText('Mensagem')).toHaveValue('');
    expect(screen.queryByRole('button',{name:'Remover anexo foto.png'})).toBeNull();
    expect(screen.getByRole('button',{name:'Enviar mensagem'})).toBeDisabled();
    expect(requests('/attachments')).toHaveLength(1);
  });
  it('preserva texto/anexo em rejeição de envio e libera nova tentativa sem upload', async () => {
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url,init) => {
      if (url.endsWith('/messages')) return Promise.resolve(json({},400));
      if (url.endsWith('/conversations/conversation')) return Promise.resolve(json({messages:[],approvals:[]}));
      return original(url,init);
    });
    render(<ChatPage/>); await select();
    fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Pergunta'}});
    fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Mensagem')).toHaveValue('Pergunta');
    expect(screen.getByRole('button',{name:'Remover anexo foto.png'})).toBeEnabled();
    expect(screen.getByRole('button',{name:'Enviar mensagem'})).toBeEnabled();
    expect(requests('/attachments')).toHaveLength(1);
  });
  it('bloqueia novo envio se não consegue reconciliar uma falha ambígua', async () => {
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url,init) => url.endsWith('/messages') || url.endsWith('/conversations/conversation') ? Promise.reject(new Error('offline')) : original(url,init));
    render(<ChatPage/>); await select();
    fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
    await screen.findByText(/Atualize a conversa para recuperar/);
    expect(screen.getByRole('button',{name:'Enviar mensagem'})).toBeDisabled();
    expect(screen.getByRole('button',{name:'Remover anexo foto.png'})).toBeDisabled();
    expect(screen.getByRole('button',{name:'Atualizar conversa'})).toBeEnabled();
  });
  it('oferece clipe/microfone sem iniciar permissão, upload ou conversa', async () => {
    render(<ChatPage/>);
    await screen.findByRole('button',{name:'Outra conversa'});
    expect(screen.getByRole('button',{name:'Anexar arquivos'})).toBeEnabled();
    expect(screen.getByRole('button',{name:'Gravar mensagem'})).toBeEnabled();
    expect(screen.getByLabelText('Selecionar anexos')).toHaveAttribute('multiple');
    expect(screen.getByRole('button',{name:'Enviar mensagem'})).toHaveClass('ady-chat-send');
    expect(screen.getByRole('button',{name:'Anexar arquivos'})).toHaveClass('ady-chat-media-action');
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('cria conversa sob seleção e envia só attachmentIds preservando metadados no done', async () => {
    render(<ChatPage/>); await select();
    expect(requests('/conversations').filter(([,init]) => init.method === 'POST')).toHaveLength(1);
    expect(requests('/attachments')[0][1].body).toBeInstanceOf(FormData);
    expect(requests('/messages')).toHaveLength(0);
    expect(screen.getByRole('button',{name:'Enviar mensagem'})).toBeEnabled();
    fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
    await screen.findByText('Recebi seu arquivo');
    expect(JSON.parse(requests('/messages')[0][1].body)).toEqual({attachmentIds:[attachment.id]});
    const message = document.querySelector('.ady-chat-message[data-role="user"]')!;
    expect(within(message as HTMLElement).getByText('foto.png')).toBeInTheDocument();
    expect(within(message as HTMLElement).queryByText(/descreva|analise/i)).toBeNull();
    expect(screen.queryByRole('button',{name:'Remover anexo foto.png'})).toBeNull();
    expect(screen.getByRole('button',{name:'Arquivo recebido'})).toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local');
  });
  it('mantém rascunho e permite repetir upload antes de enviar texto e anexo', async () => {
    const realMock = fetchMock.getMockImplementation()!;
    let first = true;
    fetchMock.mockImplementation((url,init) => { if (url.endsWith('/attachments') && first) { first = false; return Promise.resolve(json({},500)); } return realMock(url,init); });
    render(<ChatPage/>);
    fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Minha pergunta'}});
    fireEvent.change(screen.getByLabelText('Selecionar anexos'),{target:{files:[file()]}});
    await screen.findByRole('button',{name:'Tentar enviar foto.png novamente'});
    expect(screen.getByLabelText('Mensagem')).toHaveValue('Minha pergunta');
    expect(screen.getByRole('img',{name:'Prévia de foto.png'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Enviar mensagem'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'Tentar enviar foto.png novamente'}));
    await screen.findByText('Pronto para enviar');
    fireEvent.click(screen.getByRole('button',{name:'Enviar mensagem'}));
    await screen.findByText('Recebi seu arquivo');
    expect(JSON.parse(requests('/messages')[0][1].body)).toEqual({content:'Minha pergunta',attachmentIds:[attachment.id]});
  });
  it.each(['drop','paste'])('aceita imagem via %s sem autoenviar', async method => {
    render(<ChatPage/>);
    const input = screen.getByLabelText('Mensagem');
    if (method === 'drop') fireEvent.drop(input.closest('.ady-chat-composer-area')!,{dataTransfer:{files:[file()],types:['Files']}});
    else fireEvent.paste(input,{clipboardData:{files:[file()],items:[]}});
    await screen.findByText('Pronto para enviar');
    expect(requests('/attachments')).toHaveLength(1);
    expect(requests('/messages')).toHaveLength(0);
  });
  it('rejeita SVG/arquivos extras sem criar conversa nem perder texto', async () => {
    render(<ChatPage/>);
    fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Rascunho'}});
    fireEvent.change(screen.getByLabelText('Selecionar anexos'),{target:{files:[new File(['<svg/>'],'bad.svg',{type:'image/svg+xml'})]}});
    expect(await screen.findByRole('alert')).toHaveTextContent(/JPEG/);
    expect(requests('/attachments')).toHaveLength(0);
    expect(screen.getByLabelText('Mensagem')).toHaveValue('Rascunho');
  });
  it('dita sem criar conversa e acrescenta ao rascunho atual sem autoenviar', async () => {
    render(<ChatPage/>);
    fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Antes'}});
    fireEvent.click(screen.getByRole('button',{name:'Gravar mensagem'}));
    await screen.findByRole('button',{name:'Parar gravação'});
    expect(screen.getByRole('button',{name:'Enviar mensagem'})).toBeDisabled();
    expect(screen.getByLabelText('Duração da gravação')).toHaveTextContent('00:00');
    fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Antes editado'}});
    fireEvent.click(screen.getByRole('button',{name:'Parar gravação'}));
    await waitFor(() => expect(screen.getByLabelText('Mensagem')).toHaveValue('Antes editado Texto ditado'));
    expect(screen.getByLabelText('Mensagem')).toHaveFocus();
    expect(requests('/messages')).toHaveLength(0);
    expect(requests('/conversations').filter(([,init]) => init.method === 'POST')).toHaveLength(0);
    expect(stopTrack).toHaveBeenCalled();
  });
  it('cancela microfone ao trocar conversa', async () => {
    render(<ChatPage/>);
    await screen.findByRole('button',{name:'Outra conversa'});
    fireEvent.click(screen.getByRole('button',{name:'Gravar mensagem'}));
    await screen.findByRole('button',{name:'Parar gravação'});
    fireEvent.click(screen.getByRole('button',{name:'Outra conversa'}));
    await waitFor(() => expect(screen.getByRole('button',{name:'Gravar mensagem'})).toBeEnabled());
    expect(stopTrack).toHaveBeenCalled();
    expect(requests('/transcriptions')).toHaveLength(0);
  });
  it('bloqueia send duplicado e preserva upload ao trocar conversa', async () => {
    let finish!: (response: Response) => void;
    const realMock = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url,init) => url.endsWith('/attachments') ? new Promise(resolve => {finish = resolve;}) : realMock(url,init));
    render(<ChatPage/>);
    fireEvent.change(screen.getByLabelText('Mensagem'),{target:{value:'Rascunho'}});
    fireEvent.change(screen.getByLabelText('Selecionar anexos'),{target:{files:[file()]}});
    await waitFor(() => expect(requests('/attachments')).toHaveLength(1));
    fireEvent.submit(screen.getByLabelText('Mensagem').closest('form')!);
    expect(requests('/messages')).toHaveLength(0);
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
    fireEvent.click(screen.getByRole('button',{name:'Outra conversa'}));
    await waitFor(() => expect(screen.getByLabelText('Mensagem')).toBeEnabled());
    expect(requests('/attachments')[0][1].signal.aborted).toBe(false);
    await act(async () => finish(json({attachments:[attachment]})));
    expect(screen.queryByText('foto.png')).toBeNull();
    expect(screen.getByLabelText('Mensagem')).toHaveValue('');
    fetchMock.mockImplementation((url, init) => url.endsWith('/conversations/conversation') ? Promise.resolve(json({messages:[],approvals:[]})) : original(url,init));
    fireEvent.click(within(screen.getByRole('navigation',{name:'Histórico de conversas'})).getByRole('button',{name:'Nova conversa'}));
    await waitFor(() => expect(screen.getByLabelText('Mensagem')).toHaveValue('Rascunho'));
    expect(screen.getByText('Pronto para enviar')).toBeInTheDocument();
  });
});
