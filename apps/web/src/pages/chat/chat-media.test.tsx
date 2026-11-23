// @vitest-environment jsdom
/* Funcionalidade: anexar arquivos privados ao rascunho
 * Cenário: validar limites — Dado arquivos suportados, Quando seleciono, Então valido formato/tamanho/total antes de enviar.
 * Cenário: upload real — Dado uma seleção válida, Quando crio a conversa, Então envio multipart files e aguardo metadados confirmados.
 * Cenário: falha e nova tentativa — Dado uma falha, Quando tento novamente, Então preservo a prévia e reutilizo a conversa.
 * Cenário: remover/cancelar — Dado upload ou arquivo pronto, Quando removo, Então aborto/revogo ou removo no servidor.
 * Cenário: mudar de conversa — Dado uma operação pendente, Quando limpo o escopo, Então ignoro resultados atrasados.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateFiles, type Attachment } from './chat-media';
import { useChatAttachments } from './useChatAttachments';
const MiB = 1024 * 1024;
const image = () => new File(['image'],'foto.png',{type:'image/png'});
function sized(type: string, size: number) { const file = new File(['data'], 'arquivo', {type}); Object.defineProperty(file,'size',{value:size}); return file; }
const metadata: Attachment = {id:'f2965267-90d4-42a9-a646-4255c65e9c76',filename:'foto.png',mimeType:'image/png',sizeBytes:5};
let fetchMock: ReturnType<typeof vi.fn>;
let ensure: ReturnType<typeof vi.fn>;
let revoke: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({attachments:[metadata]})));
  ensure = vi.fn().mockResolvedValue('conversation');
  revoke = vi.fn();
  let index = 0;
  URL.createObjectURL = vi.fn(() => `blob:local-${++index}`);
  URL.revokeObjectURL = revoke;
  vi.stubGlobal('fetch',fetchMock);
  localStorage.setItem('token','test-token');
});
afterEach(() => vi.unstubAllGlobals());

describe('validação de anexos', () => {
  it.each(['image/jpeg','image/png','image/webp','application/pdf','video/mp4','video/webm'])('aceita formato %s', type => {
    expect(validateFiles([sized(type, 100)], [])).toBeNull();
  });
  it.each(['image/svg+xml','text/html','application/javascript','audio/webm',''])('rejeita formato %s', type => {
    expect(validateFiles([sized(type,100)],[])).toMatch(/JPEG.*PNG.*WebP.*PDF.*MP4.*WebM/);
  });
  it.each([['image/png',10],['application/pdf',20],['video/mp4',50]] as const)('respeita limite inclusivo de %s', (type,limit) => {
    expect(validateFiles([sized(type,limit * MiB)],[])).toBeNull();
    expect(validateFiles([sized(type,limit * MiB + 1)],[])).toMatch(/limite/);
  });
  it('rejeita vazio e mais de 3 incluindo a seleção anterior', () => {
    expect(validateFiles([sized('image/png',0)],[])).toMatch(/vazio/);
    expect(validateFiles([image(),image()],[image(),image()])).toMatch(/3 arquivos/);
  });
  it('respeita 60 MiB agregados incluindo arquivos anteriores', () => {
    const existing = [sized('video/mp4',50 * MiB)];
    expect(validateFiles([sized('image/png',10 * MiB)],existing)).toBeNull();
    expect(validateFiles([sized('application/pdf',10 * MiB + 1)],existing)).toMatch(/60 MB/);
  });
});
describe('useChatAttachments', () => {
  it('faz upload somente após seleção, usando files e autenticação', async () => {
    const {result} = renderHook(() => useChatAttachments(ensure));
    expect(fetchMock).not.toHaveBeenCalled();
    await act(() => result.current.add([image()]));
    expect(ensure).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/conversations\/conversation\/attachments$/);
    const init = fetchMock.mock.calls[0][1];
    expect(init.body.getAll('files')).toHaveLength(1);
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-token');
    expect(result.current.items[0]).toMatchObject({status:'ready',attachment:metadata});
    expect(result.current.ready).toEqual([metadata]);
  });
  it('reserva slots imediatamente e não duplica criação durante seleção dupla', async () => {
    let finish!: (id: string) => void;
    ensure.mockImplementation(() => new Promise(resolve => {finish = resolve;}));
    const {result} = renderHook(() => useChatAttachments(ensure));
    act(() => { void result.current.add([image(),image(),image()]); void result.current.add([image()]); });
    expect(ensure).toHaveBeenCalledTimes(1);
    expect(result.current.items).toHaveLength(3);
    expect(result.current.error).toMatch(/3 arquivos/);
    await act(async () => finish('conversation'));
  });
  it.each([400,401,403,404,413,415,502])('mantém prévia e bloqueia envio após HTTP %s', async status => {
    fetchMock.mockResolvedValueOnce(new Response('{}',{status}));
    const {result} = renderHook(() => useChatAttachments(ensure));
    await act(() => result.current.add([image()]));
    expect(result.current.items[0]).toMatchObject({status:'failed',previewUrl:'blob:local-1'});
    expect(result.current.blocked).toBe(true);
    expect(result.current.ready).toEqual([]);
    expect(revoke).not.toHaveBeenCalled();
  });
  it('repete upload sem duplicar seleção nem criar outra conversa', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const {result} = renderHook(() => useChatAttachments(ensure));
    await act(() => result.current.add([image()]));
    await act(() => result.current.retry(result.current.items[0].key));
    expect(ensure).toHaveBeenCalledTimes(1);
    expect(result.current.ready).toEqual([metadata]);
    expect(result.current.items).toHaveLength(1);
  });
  it('preserva arquivo quando criação falha e permite tentar novamente', async () => {
    ensure.mockResolvedValueOnce(null);
    const {result} = renderHook(() => useChatAttachments(ensure));
    await act(() => result.current.add([image()]));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.items[0].status).toBe('failed');
    await act(() => result.current.retry(result.current.items[0].key));
    expect(result.current.ready).toEqual([metadata]);
  });
  it('só remove prévia pronta após DELETE confirmado; falha preserva anexo', async () => {
    const {result} = renderHook(() => useChatAttachments(ensure));
    await act(() => result.current.add([image()]));
    const key = result.current.items[0].key;
    fetchMock.mockResolvedValueOnce(new Response('{}',{status:409}));
    await act(() => result.current.remove(key));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].error).toMatch(/remover/);
    fetchMock.mockResolvedValueOnce(new Response(null,{status:204}));
    await act(() => result.current.remove(key));
    expect(fetchMock.mock.calls.at(-1)).toMatchObject([expect.stringContaining(`/attachments/${metadata.id}`),{method:'DELETE'}]);
    expect(result.current.items).toHaveLength(0);
    expect(revoke).toHaveBeenCalledWith('blob:local-1');
  });
  it.each(['remove','clear','unmount'])('aborta upload e ignora resposta tardia após %s', async action => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise(resolve => {finish = resolve;}));
    const {result,unmount} = renderHook(() => useChatAttachments(ensure));
    act(() => { void result.current.add([image()]); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    act(() => {
      if (action === 'remove') void result.current.remove(result.current.items[0].key);
      else if (action === 'clear') result.current.clear();
      else unmount();
    });
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => finish(new Response(JSON.stringify({attachments:[metadata]}))));
    expect(revoke).toHaveBeenCalledWith('blob:local-1');
    if (action !== 'unmount') expect(result.current.items).toHaveLength(0);
  });
  it('ignora criação tardia após limpar seleção', async () => {
    let finish!: (id: string) => void;
    ensure.mockImplementation(() => new Promise(resolve => {finish = resolve;}));
    const {result} = renderHook(() => useChatAttachments(ensure));
    act(() => { void result.current.add([image()]); });
    act(() => result.current.clear());
    await act(async () => finish('old-conversation'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.items).toHaveLength(0);
  });
  it('não aceita resposta de upload sem DTO válido', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"attachments":[{"id":"broken","url":"https://public.invalid"}]}'));
    const {result} = renderHook(() => useChatAttachments(ensure));
    await act(() => result.current.add([image()]));
    expect(result.current.items[0].status).toBe('failed');
    expect(result.current.ready).toEqual([]);
  });
});
