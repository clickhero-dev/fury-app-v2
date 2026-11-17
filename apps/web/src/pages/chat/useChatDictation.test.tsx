// @vitest-environment jsdom
/* Funcionalidade: ditado revisável e privado
 * Cenário: iniciar por ação explícita e parar — Dado o hook montado, Quando gravo e paro, Então transcreve sem enviar mensagem.
 * Cenário: cancelar ou desmontar — Dado gravação/permissão/transcrição pendente, Quando cancelo, Então libera tracks e ignora resposta tardia.
 * Cenário: compatibilidade — Dado suporte MP4 ou WebM, Quando gravo, Então usa o formato suportado.
 * Cenário: limites — Dado áudio de 3 minutos/10 MiB, Quando atinge o limite, Então encerra captura e rejeita excesso.
 * Cenário: falhas — Dado recusa, silêncio, erro de captura ou API, Quando tento ditar, Então mostra erro sem texto inventado.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatDictation } from './useChatDictation';

class RecorderMock {
  static instances: RecorderMock[] = [];
  static isTypeSupported = vi.fn((mime: string) => mime.startsWith('audio/webm'));
  state = 'inactive';
  mimeType: string;
  ondataavailable: ((e: {data: Blob}) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(_stream: MediaStream, options: MediaRecorderOptions) { this.mimeType = options.mimeType || ''; RecorderMock.instances.push(this); }
  start = vi.fn(() => { this.state = 'recording'; });
  stop = vi.fn(() => { this.state = 'inactive'; queueMicrotask(() => { this.ondataavailable?.({data:new Blob(['voice'], {type:this.mimeType})}); this.onstop?.(); }); });
  emit(size: number) { this.ondataavailable?.({data:new Blob([new Uint8Array(size)], {type:this.mimeType})}); }
}
const stopTrack = vi.fn();
const track = new EventTarget();
Object.assign(track, {stop:stopTrack});
const stream = {getTracks:() => [track]} as unknown as MediaStream;
let getUserMedia: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  RecorderMock.instances = [];
  RecorderMock.isTypeSupported.mockImplementation(mime => mime.startsWith('audio/webm'));
  stopTrack.mockClear();
  getUserMedia = vi.fn().mockResolvedValue(stream);
  fetchMock = vi.fn().mockResolvedValue(new Response('{"text":"Texto ditado"}'));
  vi.stubGlobal('MediaRecorder', RecorderMock);
  Object.defineProperty(navigator, 'mediaDevices', {configurable:true,value:{getUserMedia}});
  vi.stubGlobal('fetch', fetchMock);
  localStorage.setItem('token','test-token');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const lastRecorder = () => RecorderMock.instances.at(-1)!;

describe('useChatDictation', () => {
  it('interrompe com aviso se o microfone é desconectado ou perde permissão', async () => {
    const onText = vi.fn();
    const {result} = renderHook(() => useChatDictation(onText));
    await act(() => result.current.start());
    await act(() => track.dispatchEvent(new Event('ended')));
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toMatch(/microfone/i);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onText).not.toHaveBeenCalled();
  });
  it('encerra transcrição por timeout mesmo se fetch não respeitar abort', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const {result} = renderHook(() => useChatDictation(vi.fn()));
    await act(() => result.current.start());
    await act(() => result.current.stop());
    await act(async () => vi.advanceTimersByTime(90000));
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toMatch(/demorou/i);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it('só pede permissão ao iniciar e entrega texto revisável via multipart audio', async () => {
    const onText = vi.fn();
    const {result} = renderHook(() => useChatDictation(onText));
    expect(getUserMedia).not.toHaveBeenCalled();
    await act(() => result.current.start());
    expect(getUserMedia).toHaveBeenCalledWith({audio:true});
    expect(result.current.status).toBe('recording');
    expect(lastRecorder().start).toHaveBeenCalledWith(1000);
    await act(() => result.current.stop());
    await waitFor(() => expect(onText).toHaveBeenCalledWith('Texto ditado'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/chat\/transcriptions$/);
    const init = fetchMock.mock.calls[0][1];
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.body.get('audio').type).toMatch(/audio\/webm/);
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-token');
    expect(stopTrack).toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });
  it('negocia MP4 se WebM não for suportado', async () => {
    RecorderMock.isTypeSupported.mockImplementation(mime => mime === 'audio/mp4');
    const {result} = renderHook(() => useChatDictation(vi.fn()));
    await act(() => result.current.start());
    expect(lastRecorder().mimeType).toBe('audio/mp4');
    await act(() => result.current.stop());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][1].body.get('audio').name).toBe('ditado.mp4');
  });
  it('não pede permissão sem formato suportado', async () => {
    RecorderMock.isTypeSupported.mockReturnValue(false);
    const {result} = renderHook(() => useChatDictation(vi.fn()));
    await act(() => result.current.start());
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/navegador/i);
  });
  it('bloqueia cliques simultâneos enquanto aguarda permissão', async () => {
    getUserMedia.mockImplementation(() => new Promise(() => {}));
    const {result} = renderHook(() => useChatDictation(vi.fn()));
    act(() => { void result.current.start(); void result.current.start(); });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('requesting');
  });
  it('cancela gravação sem transcrever', async () => {
    const {result} = renderHook(() => useChatDictation(vi.fn()));
    await act(() => result.current.start());
    await act(() => result.current.cancel());
    expect(stopTrack).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });
  it.each(['cancel','unmount'])('libera permissão tardia após %s', async action => {
    let resolve!: (stream: MediaStream) => void;
    getUserMedia.mockImplementation(() => new Promise(r => {resolve = r;}));
    const {result,unmount} = renderHook(() => useChatDictation(vi.fn()));
    act(() => { void result.current.start(); });
    act(() => action === 'cancel' ? result.current.cancel() : unmount());
    await act(async () => resolve(stream));
    expect(stopTrack).toHaveBeenCalled();
    expect(RecorderMock.instances).toHaveLength(0);
  });
  it.each(['cancel','unmount'])('aborta transcrição e ignora resultado tardio após %s', async action => {
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise(r => {resolve = r;}));
    const onText = vi.fn();
    const {result,unmount} = renderHook(() => useChatDictation(onText));
    await act(() => result.current.start());
    await act(() => result.current.stop());
    expect(result.current.status).toBe('transcribing');
    act(() => action === 'cancel' ? result.current.cancel() : unmount());
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => resolve(new Response('{"text":"Atrasado"}')));
    expect(onText).not.toHaveBeenCalled();
  });
  it('mostra recusa de permissão sem transcrever', async () => {
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    const {result} = renderHook(() => useChatDictation(vi.fn()));
    await act(() => result.current.start());
    expect(result.current.error).toMatch(/permissão/i);
    expect(result.current.status).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('encerra tracks quando o recorder falha', async () => {
    const {result} = renderHook(() => useChatDictation(vi.fn()));
    await act(() => result.current.start());
    await act(() => lastRecorder().onerror?.());
    expect(stopTrack).toHaveBeenCalled();
    expect(result.current.error).toMatch(/gravação/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('para automaticamente aos 3 minutos e mantém duração visível', async () => {
    vi.useFakeTimers();
    const {result} = renderHook(() => useChatDictation(vi.fn()));
    await act(() => result.current.start());
    await act(async () => vi.advanceTimersByTime(180000));
    expect(lastRecorder().stop).toHaveBeenCalledTimes(1);
    expect(result.current.seconds).toBe(180);
    expect(stopTrack).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('rejeita excesso de 10 MiB sem enviar áudio truncado', async () => {
    const {result} = renderHook(() => useChatDictation(vi.fn()));
    await act(() => result.current.start());
    await act(() => lastRecorder().emit(10 * 1024 * 1024 + 1));
    expect(stopTrack).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/10 MB/);
  });
  it('não inventa texto para silêncio', async () => {
    fetchMock.mockResolvedValue(new Response('{"text":"  "}'));
    const onText = vi.fn();
    const {result} = renderHook(() => useChatDictation(onText));
    await act(() => result.current.start());
    await act(() => result.current.stop());
    await waitFor(() => expect(result.current.error).toMatch(/fala/i));
    expect(onText).not.toHaveBeenCalled();
  });
  it.each([400,401,403,413,415,429,502])('preserva texto e informa falha HTTP %s', async status => {
    fetchMock.mockResolvedValue(new Response('{}', {status}));
    const onText = vi.fn();
    const {result} = renderHook(() => useChatDictation(onText));
    await act(() => result.current.start());
    await act(() => result.current.stop());
    await waitFor(() => expect(result.current.error).not.toBe(''));
    expect(onText).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(stopTrack).toHaveBeenCalled();
  });
});
