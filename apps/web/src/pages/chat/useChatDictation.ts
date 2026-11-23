import { useCallback, useEffect, useRef, useState } from 'react';
import { chatRequest, mediaError } from './chat-request';

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 180;
type Status = 'idle' | 'requesting' | 'recording' | 'transcribing';
type Capture = { version: number; recorder?: MediaRecorder; stream?: MediaStream; timer?: ReturnType<typeof setInterval>; request?: AbortController; timeout?: ReturnType<typeof setTimeout>; detachTracks?: () => void };

function release(capture: Capture) {
  clearInterval(capture.timer);
  clearTimeout(capture.timeout);
  capture.request?.abort();
  capture.detachTracks?.();
  if (capture.recorder) {
    capture.recorder.ondataavailable = null;
    capture.recorder.onstop = null;
    capture.recorder.onerror = null;
    if (capture.recorder.state !== 'inactive') capture.recorder.stop();
  }
  capture.stream?.getTracks().forEach(track => track.stop());
}

export function useChatDictation(onText: (text: string) => void) {
  const capture = useRef<Capture>({version:0});
  const [status, setStatus] = useState<Status>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const cancel = useCallback(() => {
    const previous = capture.current;
    capture.current = {version:previous.version + 1};
    release(previous);
    setStatus('idle'); setError('');
  }, []);
  useEffect(() => () => {
    const previous = capture.current;
    capture.current = {version:previous.version + 1};
    release(previous);
  }, []);

  function stop() {
    const active = capture.current;
    if (active.recorder?.state !== 'recording') return;
    clearInterval(active.timer);
    active.detachTracks?.();
    // stop queues the final dataavailable before onstop; do not detach handlers here.
    active.recorder.stop();
    active.stream?.getTracks().forEach(track => track.stop());
    setStatus('transcribing');
  }
  async function start() {
    if (capture.current.stream || capture.current.request || capture.current.recorder || status !== 'idle') return;
    const previousVersion = capture.current.version;
    const active: Capture = {version:previousVersion + 1};
    capture.current = active;
    const isCurrent = () => capture.current === active;
    // A synchronous reservation also blocks repeated clicks before React rerenders.
    active.request = new AbortController();
    setError(''); setSeconds(0);
    const mime = typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function'
      ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type)) : undefined;
    if (!mime || !navigator.mediaDevices?.getUserMedia) {
      active.request = undefined;
      setError('Este navegador não permite gravação de voz. Você pode digitar sua mensagem.');
      return;
    }
    setStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:true});
      if (!isCurrent()) { stream.getTracks().forEach(track => track.stop()); return; }
      active.stream = stream;
      active.request = undefined;
      const recorder = new MediaRecorder(stream, {mimeType:mime});
      active.recorder = recorder;
      const chunks: Blob[] = [];
      let size = 0;
      const fail = (message: string) => {
        if (!isCurrent()) return;
        cancel(); setError(message);
      };
      const lostMicrophone = () => fail('O microfone foi desconectado. Verifique a permissão e tente novamente.');
      stream.getTracks().forEach(track => track.addEventListener('ended',lostMicrophone));
      active.detachTracks = () => stream.getTracks().forEach(track => track.removeEventListener('ended',lostMicrophone));
      recorder.ondataavailable = event => {
        if (!isCurrent() || !event.data.size) return;
        size += event.data.size;
        if (size > MAX_AUDIO_BYTES) { fail('A gravação ultrapassou 10 MB. Grave uma mensagem mais curta.'); return; }
        chunks.push(event.data);
      };
      recorder.onerror = () => fail('A gravação foi interrompida. Verifique o microfone e tente novamente.');
      recorder.onstop = async () => {
        clearInterval(active.timer);
        active.detachTracks?.();
        stream.getTracks().forEach(track => track.stop());
        if (!isCurrent()) return;
        if (!size) { fail('Nenhuma fala foi capturada. Tente gravar novamente.'); return; }
        const audio = new Blob(chunks, {type:recorder.mimeType || mime});
        const body = new FormData();
        body.append('audio', audio, audio.type.includes('mp4') ? 'ditado.mp4' : 'ditado.webm');
        const controller = new AbortController();
        active.request = controller;
        setStatus('transcribing');
        active.timeout = setTimeout(() => { if (isCurrent()) { cancel(); setError('A transcrição demorou demais. Tente novamente.'); } }, 90000);
        try {
          const data = await (await chatRequest('/transcriptions', {method:'POST', body, signal:controller.signal})).json();
          if (!isCurrent()) return;
          if (typeof data.text !== 'string' || !data.text.trim()) { fail('Nenhuma fala foi reconhecida. Tente gravar novamente.'); return; }
          onText(data.text.trim());
        } catch (err) { if (isCurrent()) setError(mediaError(err, 'transcribe')); }
        finally {
          if (isCurrent()) {
            clearTimeout(active.timeout);
            capture.current = {version:active.version + 1};
            release(active);
            setStatus('idle');
          }
        }
      };
      recorder.start(1000);
      const began = Date.now();
      active.timer = setInterval(() => {
        if (!isCurrent()) return;
        const elapsed = Math.floor((Date.now() - began) / 1000);
        setSeconds(Math.min(elapsed, MAX_AUDIO_SECONDS));
        if (elapsed >= MAX_AUDIO_SECONDS) stop();
      }, 250);
      setStatus('recording');
    } catch (err) {
      if (!isCurrent()) return;
      cancel();
      setError((err as {name?: string})?.name === 'NotAllowedError'
        ? 'Permissão para o microfone negada. Autorize no navegador ou digite sua mensagem.'
        : 'Não foi possível iniciar a gravação. Verifique seu microfone.');
    }
  }
  return {status, seconds, error, start, stop, cancel, active:status !== 'idle'};
}
