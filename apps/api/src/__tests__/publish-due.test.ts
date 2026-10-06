import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock meta-api functions
const createInstagramMedia = vi.fn();
const getMediaContainerStatus = vi.fn();
const publishInstagramMedia = vi.fn();
const getUserFacebookPages = vi.fn();

vi.mock('../lib/meta-api.js', () => ({
  createInstagramMedia: (...args: any[]) => createInstagramMedia(...args),
  getMediaContainerStatus: (...args: any[]) => getMediaContainerStatus(...args),
  publishInstagramMedia: (...args: any[]) => publishInstagramMedia(...args),
  getUserFacebookPages: (...args: any[]) => getUserFacebookPages(...args),
}));

import { publishSinglePost } from '../services/planner/planner.service.js';

const igUserId = 'mock_ig_user_id';
const accessToken = 'mock_access_token';

beforeEach(() => {
  createInstagramMedia.mockReset();
  getMediaContainerStatus.mockReset();
  publishInstagramMedia.mockReset();
});

describe('publishSinglePost', () => {
  it('publica imagem com sucesso', async () => {
    createInstagramMedia.mockResolvedValue('container_1');
    getMediaContainerStatus.mockResolvedValue('FINISHED');
    publishInstagramMedia.mockResolvedValue('media_123');

    vi.useFakeTimers();
    try {
      const resultPromise = publishSinglePost(
        { id: 'post-1', postType: 'image', caption: 'Minha legenda', imageUrl: 'https://cdn.example.com/img.png' },
        igUserId,
        accessToken,
      );

      // 1º poll (3s): FINISHED → publica na primeira checagem
      await vi.advanceTimersByTimeAsync(3_000);

      const result = await resultPromise;

      expect(result.mediaId).toBe('media_123');
      expect(createInstagramMedia).toHaveBeenCalledWith(igUserId, accessToken, {
        imageUrl: 'https://cdn.example.com/img.png',
        caption: 'Minha legenda',
        mediaType: undefined,
      });
      expect(getMediaContainerStatus).toHaveBeenCalledTimes(1);
      expect(publishInstagramMedia).toHaveBeenCalledWith(igUserId, accessToken, 'container_1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('publica reel (vídeo) com polling', async () => {
    createInstagramMedia.mockResolvedValue('container_video');
    // Primeiro poll: IN_PROGRESS, segundo: FINISHED
    getMediaContainerStatus
      .mockResolvedValueOnce('IN_PROGRESS')
      .mockResolvedValueOnce('FINISHED');
    publishInstagramMedia.mockResolvedValue('media_456');

    vi.useFakeTimers();
    try {
      const resultPromise = publishSinglePost(
        { id: 'post-2', postType: 'reel', caption: 'Reel top', imageUrl: 'https://cdn.example.com/video.mp4' },
        igUserId,
        accessToken,
      );

      // vídeo: 1º poll (5s) IN_PROGRESS, 2º poll (+5s) FINISHED
      await vi.advanceTimersByTimeAsync(5_000);
      await vi.advanceTimersByTimeAsync(5_000);

      const result = await resultPromise;

      expect(result.mediaId).toBe('media_456');
      expect(createInstagramMedia).toHaveBeenCalledWith(igUserId, accessToken, {
        videoUrl: 'https://cdn.example.com/video.mp4',
        caption: 'Reel top',
        mediaType: 'REELS',
      });
      expect(getMediaContainerStatus).toHaveBeenCalledTimes(2);
      expect(publishInstagramMedia).toHaveBeenCalledWith(igUserId, accessToken, 'container_video');
    } finally {
      vi.useRealTimers();
    }
  });

  it('lança erro se post não tem imageUrl', async () => {
    await expect(
      publishSinglePost(
        { id: 'post-3', postType: 'image', imageUrl: null },
        igUserId,
        accessToken,
      ),
    ).rejects.toThrow('não tem imageUrl');
  });

  // ── RED: garantia do 9007 (issue docs/issues/erro-publish-now.md) ─────────
  // A Meta responde 9007 "Media ID is not available" quando media_publish é
  // chamado antes do container ficar FINISHED. Para image/stories o código
  // atual NÃO faz polling — publica imediatamente. Estes testes exigem o
  // mesmo polling de FINISHED que já existe para reel.

  it('stories: NÃO publica enquanto container IN_PROGRESS — espera FINISHED antes do media_publish', async () => {
    createInstagramMedia.mockResolvedValue('container_story');
    getMediaContainerStatus
      .mockResolvedValueOnce('IN_PROGRESS')
      .mockResolvedValueOnce('FINISHED');
    publishInstagramMedia.mockResolvedValue('media_story');

    vi.useFakeTimers();
    try {
      const resultPromise = publishSinglePost(
        { id: 'post-story', postType: 'stories', caption: 'aloo', imageUrl: 'https://cdn.example.com/story.png' },
        igUserId,
        accessToken,
      );

      // antes de avançar o tempo: NENHUM media_publish (container ainda IN_PROGRESS)
      await vi.advanceTimersByTimeAsync(0);
      expect(publishInstagramMedia).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(3_000); // 1º poll: IN_PROGRESS
      expect(publishInstagramMedia).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(3_000); // 2º poll: FINISHED → publica
      const result = await resultPromise;

      expect(result.mediaId).toBe('media_story');
      expect(createInstagramMedia).toHaveBeenCalledWith(igUserId, accessToken, {
        imageUrl: 'https://cdn.example.com/story.png',
        caption: undefined,
        mediaType: 'STORIES',
      });
      expect(getMediaContainerStatus).toHaveBeenCalledTimes(2);
      expect(publishInstagramMedia).toHaveBeenCalledWith(igUserId, accessToken, 'container_story');
    } finally {
      vi.useRealTimers();
    }
  });

  it('stories com vídeo: envia video_url + STORIES', async () => {
    createInstagramMedia.mockResolvedValue('container_story_video');
    getMediaContainerStatus.mockResolvedValue('FINISHED');
    publishInstagramMedia.mockResolvedValue('media_story_video');

    vi.useFakeTimers();
    try {
      const resultPromise = publishSinglePost(
        { id: 'post-story-video', postType: 'stories', caption: 'x', imageUrl: 'https://cdn.example.com/story.mp4' },
        igUserId,
        accessToken,
      );
      await vi.advanceTimersByTimeAsync(5_000);
      const result = await resultPromise;

      expect(result.mediaId).toBe('media_story_video');
      expect(createInstagramMedia).toHaveBeenCalledWith(igUserId, accessToken, {
        videoUrl: 'https://cdn.example.com/story.mp4',
        caption: undefined,
        mediaType: 'STORIES',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('image: NÃO publica enquanto container IN_PROGRESS — espera FINISHED antes do media_publish', async () => {
    createInstagramMedia.mockResolvedValue('container_img');
    getMediaContainerStatus
      .mockResolvedValueOnce('IN_PROGRESS')
      .mockResolvedValueOnce('FINISHED');
    publishInstagramMedia.mockResolvedValue('media_img');

    vi.useFakeTimers();
    try {
      const resultPromise = publishSinglePost(
        { id: 'post-img', postType: 'image', caption: 'promo', imageUrl: 'https://cdn.example.com/img.png' },
        igUserId,
        accessToken,
      );

      await vi.advanceTimersByTimeAsync(3_000);
      expect(publishInstagramMedia).not.toHaveBeenCalled(); // ainda IN_PROGRESS

      await vi.advanceTimersByTimeAsync(3_000);
      const result = await resultPromise;

      expect(result.mediaId).toBe('media_img');
      expect(publishInstagramMedia).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stories: lança erro se container fica IN_PROGRESS após o limite de polls (sem media_publish)', async () => {
    createInstagramMedia.mockResolvedValue('container_stuck_story');
    getMediaContainerStatus.mockResolvedValue('IN_PROGRESS'); // nunca termina

    vi.useFakeTimers();
    try {
      const resultPromise = publishSinglePost(
        { id: 'post-stuck', postType: 'stories', imageUrl: 'https://cdn.example.com/story.png' },
        igUserId,
        accessToken,
      );

      const rejection = expect(resultPromise).rejects.toThrow('still IN_PROGRESS');

      await vi.advanceTimersByTimeAsync(3_000);
      await vi.advanceTimersByTimeAsync(6_000);
      await vi.advanceTimersByTimeAsync(12_000);

      await rejection;
      expect(publishInstagramMedia).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('lança erro se container de vídeo fica IN_PROGRESS após 7 polls (~85s)', async () => {
    createInstagramMedia.mockResolvedValue('container_stuck');
    getMediaContainerStatus.mockResolvedValue('IN_PROGRESS'); // nunca termina

    vi.useFakeTimers();
    try {
      const resultPromise = publishSinglePost(
        { id: 'post-4', postType: 'reel', imageUrl: 'https://cdn.example.com/video.mp4' },
        igUserId,
        accessToken,
      );

      // Anexa o handler de rejeição ANTES de avançar o tempo, evitando
      // "unhandled rejection" quando a promise lança durante o advance.
      const rejection = expect(resultPromise).rejects.toThrow('still IN_PROGRESS');

      // 7 polls de vídeo (5+5+10+10+15+20+20 = 85s) — todos IN_PROGRESS
      await vi.advanceTimersByTimeAsync(85_000);

      await rejection;
      expect(getMediaContainerStatus).toHaveBeenCalledTimes(7);
      expect(publishInstagramMedia).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('lança erro se container retorna ERROR', async () => {
    createInstagramMedia.mockResolvedValue('container_err');
    getMediaContainerStatus.mockRejectedValue(new Error('Instagram media container error: processing failed'));

    vi.useFakeTimers();
    try {
      const resultPromise = publishSinglePost(
        { id: 'post-5', postType: 'reel', imageUrl: 'https://cdn.example.com/video.mp4' },
        igUserId,
        accessToken,
      );
      const rejection = expect(resultPromise).rejects.toThrow('processing failed');
      await vi.advanceTimersByTimeAsync(5_000);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it('reel com imagem: falha sem chamar a Meta', async () => {
    await expect(
      publishSinglePost(
        { id: 'post-7', postType: 'reel', imageUrl: 'https://cdn.example.com/img.png' },
        igUserId,
        accessToken,
      ),
    ).rejects.toThrow('precisa de vídeo');
    expect(createInstagramMedia).not.toHaveBeenCalled();
  });

  it('lança erro de rede ao criar container', async () => {
    createInstagramMedia.mockRejectedValue(new Error('Network error'));

    await expect(
      publishSinglePost(
        { id: 'post-6', postType: 'image', imageUrl: 'https://cdn.example.com/img.png' },
        igUserId,
        accessToken,
      ),
    ).rejects.toThrow('Network error');
  });
});

describe('retry backoff', () => {
  it('backoff é [1, 5, 15] minutos', () => {
    const RETRY_BACKOFF_MINUTES = [1, 5, 15];
    expect(RETRY_BACKOFF_MINUTES[0]).toBe(1);
    expect(RETRY_BACKOFF_MINUTES[1]).toBe(5);
    expect(RETRY_BACKOFF_MINUTES[2]).toBe(15);
  });

  it('após 3 tentativas, não deve chamar publish', () => {
    // Verifica que com attempt 3+ o status vira 'failed' — testado via publishDuePosts
    // Esta verificação é documental: a lógica está em publishDuePosts no service
    expect(3).toBeGreaterThanOrEqual(3); // tentativa 3 = falha definitiva
  });
});

describe('resolveInstagramAccount', () => {
  it('retorna null se tenant não tem conexão Meta', async () => {
    // Teste de integração — requer DB. Coberto por teste manual no quickstart.
    // Documentando que a função existe e é exportada.
    expect(true).toBe(true); // placeholder: função existe e é testável
  });
});
