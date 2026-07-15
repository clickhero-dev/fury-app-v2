import { useState } from 'react';
import { X, Copy, Check, Film, LayoutGrid, Image, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { useMutation } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Post } from '../PlanejadorPage';

interface PostSidePanelProps {
  post: Post;
  onClose: () => void;
  onUpdate: (post: Post) => void;
}

const postIcons: Record<string, typeof Film> = {
  reel: Film,
  carousel: LayoutGrid,
  image: Image,
  stories: Sparkles,
};

const postLabels: Record<string, string> = {
  reel: 'Reels',
  carousel: 'Carrossel',
  image: 'Post',
  stories: 'Stories',
};

const statusLabels: Record<string, string> = {
  draft: 'Rascunho',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  published: 'Publicado',
};

const statusColors: Record<string, string> = {
  draft: 'text-gray-400 bg-gray-500/10',
  approved: 'text-green-400 bg-green-500/10',
  rejected: 'text-red-400 bg-red-500/10',
  published: 'text-blue-400 bg-blue-500/10',
};

export function PostSidePanel({ post, onClose, onUpdate }: PostSidePanelProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showAiEditor, setShowAiEditor] = useState(false);

  const Icon = postIcons[post.postType] ?? Image;

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const copyBtn = (text: string, field: string) => (
    <button
      onClick={() => copyToClipboard(text, field)}
      className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-gray-200 transition-colors"
    >
      {copiedField === field ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
    </button>
  );

  const aiEditMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const { data } = await api.patch(`/planner/posts/${post.id}`, {
        caption: `${post.caption}\n\n[Editado via IA: ${prompt}]`,
      });
      return data as Post;
    },
    onSuccess: (data) => {
      onUpdate(data);
      setShowAiEditor(false);
      setAiPrompt('');
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-[#1F2937] border-l border-gray-700/50 h-full overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[#1F2937] border-b border-gray-700/50 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className={clsx(
              'w-10 h-10 rounded-xl flex items-center justify-center',
              post.postType === 'reel' ? 'bg-purple-500/10' :
              post.postType === 'carousel' ? 'bg-blue-500/10' :
              post.postType === 'stories' ? 'bg-pink-500/10' : 'bg-green-500/10'
            )}>
              <Icon className={clsx(
                'w-5 h-5',
                post.postType === 'reel' ? 'text-purple-400' :
                post.postType === 'carousel' ? 'text-blue-400' :
                post.postType === 'stories' ? 'text-pink-400' : 'text-green-400'
              )} />
            </div>
            <div>
              <h3 className="text-white font-medium">{post.title || 'Sem título'}</h3>
              <p className="text-xs text-gray-400">
                {postLabels[post.postType]} · Dia {post.dayIndex}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-700/50 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-6">
          {/* Status */}
          <div className="flex items-center gap-2">
            <span className={clsx('text-xs font-medium px-2.5 py-1 rounded-full', statusColors[post.status])}>
              {statusLabels[post.status] ?? 'Rascunho'}
            </span>
          </div>

          {/* Caption */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-300">Legenda</h4>
              {copyBtn(post.caption, 'caption')}
            </div>
            <p className="text-sm text-gray-400 whitespace-pre-wrap bg-gray-800/50 rounded-lg p-3">
              {post.caption || '—'}
            </p>
          </div>

          {/* CTA */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-300">CTA</h4>
              {copyBtn(post.cta, 'cta')}
            </div>
            <p className="text-sm text-orange-400 bg-orange-500/10 rounded-lg p-3 font-medium">
              {post.cta || '—'}
            </p>
          </div>

          {/* Hashtags */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-300">Hashtags</h4>
              {copyBtn(post.hashtags?.join(' '), 'hashtags')}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {post.hashtags?.map((tag) => (
                <span key={tag} className="text-xs text-blue-400 bg-blue-500/10 px-2 py-1 rounded-full">
                  {tag}
                </span>
              )) ?? '—'}
            </div>
          </div>

          {/* Image Prompt */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-300">Prompt da imagem</h4>
              {copyBtn(post.imagePrompt, 'prompt')}
            </div>
            <p className="text-sm text-gray-400 bg-gray-800/50 rounded-lg p-3 italic">
              {post.imagePrompt || '—'}
            </p>
          </div>

          {/* Ações */}
          <div className="flex gap-3 pt-4 border-t border-gray-700/50">
            <button className="flex-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-xl text-sm transition-colors">
              Editar
            </button>
            <button className="flex-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-xl text-sm transition-colors">
              Regenerar
            </button>
            <button
              onClick={() => setShowAiEditor(!showAiEditor)}
              className="flex-1 px-4 py-2.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 font-medium rounded-xl text-sm transition-colors"
            >
              Melhorar com IA
            </button>
          </div>

          {/* AI Chat Editor */}
          {showAiEditor && (
            <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
              <h4 className="text-sm font-medium text-gray-300 mb-3">O que você quer mudar?</h4>
              <div className="flex gap-2">
                <input
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder='Ex: "Torne mais engraçado"'
                  className="flex-1 bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white 
                             placeholder:text-gray-500 focus:outline-none focus:border-orange-500/50"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && aiPrompt.trim()) {
                      aiEditMutation.mutate(aiPrompt);
                    }
                  }}
                />
                <button
                  onClick={() => aiPrompt.trim() && aiEditMutation.mutate(aiPrompt)}
                  disabled={aiEditMutation.isPending || !aiPrompt.trim()}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 
                             text-white font-medium rounded-lg text-sm transition-colors"
                >
                  {aiEditMutation.isPending ? '...' : 'OK'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
