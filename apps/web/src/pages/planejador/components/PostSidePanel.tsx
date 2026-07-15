import { useState } from 'react';
import { X, Copy, Check, LayoutGrid, Image, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { useMutation } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Post } from '../types';

interface PostSidePanelProps {
  post: Post;
  onClose: () => void;
  onUpdate: (post: Post) => void;
}

const postIcons: Record<string, typeof LayoutGrid> = {
  carousel: LayoutGrid,
  image: Image,
  stories: Sparkles,
};

const postLabels: Record<string, string> = {
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
  draft: 'text-text-tertiary bg-surface-secondary',
  approved: 'text-success bg-success/10',
  rejected: 'text-red-600 bg-red-50',
  published: 'text-blue-600 bg-blue-50',
};

const typeBg: Record<string, string> = {
  carousel: 'bg-blue-100',
  stories: 'bg-pink-100',
  image: 'bg-success/10',
};

const typeText: Record<string, string> = {
  carousel: 'text-blue-600',
  stories: 'text-pink-600',
  image: 'text-success',
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
      className="p-1.5 rounded-lg hover:bg-surface-secondary text-text-tertiary hover:text-text-primary transition-colors"
    >
      {copiedField === field ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
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
      <div className="relative w-full max-w-lg bg-surface border-l border-border h-full overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center', typeBg[post.postType] || 'bg-surface-secondary')}>
              <Icon className={clsx('w-5 h-5', typeText[post.postType] || 'text-text-tertiary')} />
            </div>
            <div>
              <h3 className="text-text-primary font-medium">{post.title || 'Sem título'}</h3>
              <p className="text-xs text-text-tertiary">
                {postLabels[post.postType]} · Dia {post.dayIndex}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-secondary text-text-tertiary">
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
              <h4 className="text-sm font-medium text-text-primary">Legenda</h4>
              {copyBtn(post.caption, 'caption')}
            </div>
            <p className="text-sm text-text-secondary whitespace-pre-wrap bg-surface-secondary rounded-lg p-3">
              {post.caption || '—'}
            </p>
          </div>

          {/* CTA */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-text-primary">CTA</h4>
              {copyBtn(post.cta, 'cta')}
            </div>
            <p className="text-sm text-accent bg-accent/5 rounded-lg p-3 font-medium">
              {post.cta || '—'}
            </p>
          </div>

          {/* Hashtags */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-text-primary">Hashtags</h4>
              {copyBtn(post.hashtags?.join(' '), 'hashtags')}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {post.hashtags?.map((tag) => (
                <span key={tag} className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
                  {tag}
                </span>
              )) ?? '—'}
            </div>
          </div>

          {/* Image Prompt */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-text-primary">Prompt da imagem</h4>
              {copyBtn(post.imagePrompt, 'prompt')}
            </div>
            <p className="text-sm text-text-secondary bg-surface-secondary rounded-lg p-3 italic">
              {post.imagePrompt || '—'}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-border">
            <button className="flex-1 px-4 py-2.5 bg-surface-secondary hover:bg-border text-text-primary font-medium rounded-xl text-sm transition-colors">
              Editar
            </button>
            <button className="flex-1 px-4 py-2.5 bg-surface-secondary hover:bg-border text-text-primary font-medium rounded-xl text-sm transition-colors">
              Regenerar
            </button>
            <button
              onClick={() => setShowAiEditor(!showAiEditor)}
              className="flex-1 px-4 py-2.5 bg-accent/5 hover:bg-accent/10 text-accent font-medium rounded-xl text-sm transition-colors"
            >
              Melhorar com IA
            </button>
          </div>

          {/* AI Chat Editor */}
          {showAiEditor && (
            <div className="bg-surface-secondary rounded-xl p-4 border border-border">
              <h4 className="text-sm font-medium text-text-primary mb-3">O que você quer mudar?</h4>
              <div className="flex gap-2">
                <input
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder='Ex: "Torne mais engraçado"'
                  className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary 
                             placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && aiPrompt.trim()) {
                      aiEditMutation.mutate(aiPrompt);
                    }
                  }}
                />
                <button
                  onClick={() => aiPrompt.trim() && aiEditMutation.mutate(aiPrompt)}
                  disabled={aiEditMutation.isPending || !aiPrompt.trim()}
                  className="px-4 py-2 bg-accent hover:bg-accent-light disabled:opacity-50 
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
