import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, ImagePlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import type { WizardCreativeState, WizardObjective } from '../types';

interface InstagramPostInsights {
  reach: number;
  saved: number;
  shares: number;
  replies: number;
}

interface InstagramPost {
  id: string;
  caption?: string;
  media_url?: string;
  timestamp: string;
  like_count: number;
  comments_count: number;
  insights: InstagramPostInsights;
  score: number;
  recommended: boolean;
}

interface InstagramPostsResponse {
  success: boolean;
  data: InstagramPost[];
}

interface MetaAuthUrlResponse {
  success: boolean;
  data: { authUrl: string };
}

interface InstagramPostsTabProps {
  value: WizardCreativeState;
  onChange: (updates: Partial<WizardCreativeState>) => void;
  objective: WizardObjective | null;
  instagramUserId?: string;
}

function formatMetrics(objective: WizardObjective | null, post: InstagramPost): string {
  if (objective === 'visits') {
    return `👁 ${post.insights.reach} alcance · 📤 ${post.insights.shares} compartilhamentos`;
  }
  if (objective === 'messages' || objective === 'whatsapp') {
    return `💬 ${post.insights.replies} conversas · ❤️ ${post.like_count} curtidas`;
  }
  return `🔖 ${post.insights.saved} salvamentos · 💬 ${post.comments_count} comentários`;
}

/** Carrega imagens do Instagram via proxy autenticado, evitando bloqueio de CORS do CDN da Meta. */
function ProxiedImage({ url, alt, className }: { url: string; alt: string; className?: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let currentObjectUrl: string | null = null;
    setObjectUrl(null);
    setFailed(false);

    api
      .get('/instagram/media-proxy', { params: { url }, responseType: 'blob' })
      .then((response) => {
        if (cancelled) return;
        currentObjectUrl = URL.createObjectURL(response.data as Blob);
        setObjectUrl(currentObjectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    };
  }, [url]);

  if (failed) {
    return (
      <div className={cn('flex items-center justify-center bg-gray-100 text-gray-300', className)}>
        <ImagePlus className="w-8 h-8" />
      </div>
    );
  }

  if (!objectUrl) {
    return <div className={cn('animate-pulse bg-gray-200', className)} />;
  }

  return <img src={objectUrl} alt={alt} className={className} />;
}

export function InstagramPostsTab({ value, onChange, objective, instagramUserId }: InstagramPostsTabProps) {
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<InstagramPostsResponse>({
    queryKey: ['instagram/posts-ranked', objective, instagramUserId],
    queryFn: async () => {
      const response = await api.get('/instagram/posts-ranked', {
        params: { objective: objective ?? 'engagement', instagramUserId },
      });
      return response.data;
    },
    enabled: Boolean(objective),
    retry: false,
  });

  const reconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await api.get<MetaAuthUrlResponse>('/meta/auth/url', {
        params: { context: 'settings', frontendUrl: window.location.origin },
      });
      return response.data.data.authUrl;
    },
    onSuccess: (authUrl) => {
      window.location.href = authUrl;
    },
  });

  function handleSelectPost(post: InstagramPost) {
    onChange({
      instagramMediaId: post.id,
      mediaUrl: post.media_url ?? undefined,
      assetId: undefined,
      assetUrl: undefined,
      uploadUrl: undefined,
      primaryText: value.primaryText || (post.caption ?? '').slice(0, 125),
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const errorCode = (error as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error
    ?.code;
  const errorMessage = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data
    ?.error?.message;

  const isReconnectError = errorCode === 'META_TOKEN_EXPIRED' || errorCode === 'META_PERMISSION_DENIED';
  const isInstagramAccountMissing = errorCode === 'INSTAGRAM_ACCOUNT_NOT_FOUND';

  if (isError && isReconnectError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-gray-500 gap-3">
        <p className="text-sm">Para usar esta funcionalidade, reconecte sua conta Meta.</p>
        <Button
          variant="primary"
          onClick={() => reconnectMutation.mutate()}
          disabled={reconnectMutation.isPending}
        >
          {reconnectMutation.isPending ? 'Redirecionando...' : 'Reconectar'}
        </Button>
      </div>
    );
  }

  if (isError && isInstagramAccountMissing) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-gray-500 px-4">
        <p className="text-sm">{errorMessage}</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-gray-500 gap-3">
        <p className="text-sm">Erro ao carregar posts. Tente novamente.</p>
        <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
          {isRefetching ? 'Tentando...' : 'Tentar novamente'}
        </Button>
      </div>
    );
  }

  const posts = data?.data ?? [];

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-gray-500">
        <ImagePlus className="w-8 h-8 mb-2 text-gray-300" />
        <p className="text-sm">Nenhum post encontrado no Instagram.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
      {posts.map((post) => {
        const isSelected = value.instagramMediaId === post.id;
        return (
          <button
            key={post.id}
            type="button"
            onClick={() => handleSelectPost(post)}
            className={cn(
              'relative rounded-xl overflow-hidden border-2 transition-all bg-gray-100 text-left',
              isSelected ? 'border-[#E8631A]' : 'border-transparent hover:border-[#E8631A]/40'
            )}
          >
            {post.media_url ? (
              <ProxiedImage
                url={post.media_url}
                alt={post.caption?.slice(0, 50) || 'Post do Instagram'}
                className="w-full h-48 object-cover"
              />
            ) : (
              <div className="w-full h-48 flex items-center justify-center text-gray-300">
                <ImagePlus className="w-8 h-8" />
              </div>
            )}

            {isSelected && (
              <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#E8631A] flex items-center justify-center">
                <Check className="w-4 h-4 text-white" />
              </div>
            )}

            {post.recommended && (
              <div className="absolute top-2 left-2 bg-[#E8631A] text-white text-[10px] font-bold px-2 py-1 rounded-full">
                ⚡ Recomendado pelo FURY
              </div>
            )}

            <div className="p-2 bg-white">
              {post.caption && (
                <p className="text-xs text-gray-700 line-clamp-2 mb-1">{post.caption}</p>
              )}
              <p className="text-[11px] text-gray-500">{formatMetrics(objective, post)}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
