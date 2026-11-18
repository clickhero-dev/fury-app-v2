import { useState } from 'react';
import { ChatMediaViewer } from './ChatMediaViewer';
import { InstagramShare } from './InstagramShare';

export function GeneratedChatMedia({src, kind, mediaKey}: {src: string; kind: 'image' | 'video'; mediaKey: string}) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const name = kind === 'image' ? 'Imagem gerada' : 'Vídeo gerado';
  async function download() {
    if (loading) return;
    setLoading(true); setError('');
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error('download failed');
      const blob = await response.blob();
      if (!blob.size || !blob.type.startsWith(`${kind}/`)) throw new Error('invalid media');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = kind === 'image' ? 'imagem-gerada' : 'video-gerado';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError('Não foi possível baixar a mídia. Tente novamente.');
    } finally { setLoading(false); }
  }
  return <div><ChatMediaViewer src={src} kind={kind} name={name} onDownload={() => void download()}/>
    <InstagramShare src={src} kind={kind} mediaKey={mediaKey}/>
    {loading && <p role="status">Baixando mídia…</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
