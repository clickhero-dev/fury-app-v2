import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';

export function ChatMediaViewer({src, kind, name, onDownload}: {
  src: string; kind: 'image' | 'video'; name: string; onDownload: () => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
      if (event.key === 'Tab') {
        const elements = dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), video[controls]');
        if (!elements?.length) return;
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);
  const dismiss = () => { setOpen(false); trigger.current?.focus(); };
  return <div className="relative">
    <button ref={trigger} type="button" onClick={() => setOpen(true)} aria-label={`Abrir ${name}`} className="block max-w-full">
      {kind === 'image' ? <img src={src} alt={name} className="max-w-full rounded-xl"/> : <video src={src} aria-label={name} preload="metadata" className="max-w-full rounded-xl"/>}
    </button>
    <button type="button" onClick={onDownload} aria-label={`Baixar ${name}`} className="absolute right-2 top-2 rounded-full bg-black/70 p-2 text-white"><Download size={20}/></button>
    {open && createPortal(<div ref={dialog} role="dialog" aria-modal="true" aria-label={`Visualização de ${name}`} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-12">
      <button ref={close} type="button" onClick={dismiss} aria-label="Fechar visualização" className="absolute right-4 top-4 text-white"><X size={28}/></button>
      <button type="button" onClick={onDownload} aria-label={`Baixar ${name} em tela cheia`} className="absolute left-4 top-4 text-white"><Download size={24}/></button>
      {kind === 'image' ? <img src={src} alt={name} className="max-h-full max-w-full object-contain"/> : <video src={src} aria-label={name} controls className="max-h-full max-w-full"/>}
    </div>, document.body)}
  </div>;
}
