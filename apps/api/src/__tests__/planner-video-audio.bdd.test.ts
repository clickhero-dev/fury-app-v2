import { describe, it, expect, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { ChatMediaValidator } from '../services/chat/chat-media-validator.js';
import { PlannerVideoTranscription } from '../services/planner/planner-video-transcription.js';
function video(audio = true) {
  return execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=s=32x32:d=1', ...(audio ? ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:a', 'aac'] : []), '-c:v', 'mpeg4', '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov', 'pipe:1']);
}
// Dado vídeo próprio, quando ouvir, então Whisper recebe WAV, nunca uma URL.
describe('BDD: áudio de vídeo do Planejador', () => {
  it('Cenário: vídeo com áudio → WAV para transcrição', async () => {
    const buffer = video();
    const transcribe = vi.fn().mockResolvedValue('fala');
    const adapter = new PlannerVideoTranscription(async () => buffer, new ChatMediaValidator(), { transcribe });
    expect(await adapter.transcribe('https://media.example.com/a.mp4')).toBe('fala');
    const wav = transcribe.mock.calls[0][0];
    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(wav.readUInt32LE(24)).toBe(16000);
  });
  it('Cenário: vídeo sem áudio → não chama Whisper', async () => {
    const transcribe = vi.fn();
    const adapter = new PlannerVideoTranscription(async () => video(false), new ChatMediaValidator(), { transcribe });
    expect(await adapter.transcribe('https://media.example.com/a.mp4')).toBe('');
    expect(transcribe).not.toHaveBeenCalled();
  });
  it('Cenário: arquivo inválido → não chama Whisper', async () => {
    const transcribe = vi.fn();
    const adapter = new PlannerVideoTranscription(async () => Buffer.from('invalid'), new ChatMediaValidator(), { transcribe });
    await expect(adapter.transcribe('https://media.example.com/a.mp4')).rejects.toMatchObject({ statusCode: 415 });
    expect(transcribe).not.toHaveBeenCalled();
  });
});
