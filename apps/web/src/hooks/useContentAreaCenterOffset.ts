import { useEffect, useState } from 'react';

/**
 * Deslocamento horizontal (px) entre o centro do viewport e o centro da área
 * de conteúdo (a região à direita da sidebar) — para centralizar elementos
 * `position: fixed` (modais) no conteúdo, não na tela inteira.
 *
 * Mede a sidebar de verdade via `ResizeObserver` (em vez de duplicar as
 * larguras/breakpoints do Sidebar.tsx aqui) — acompanha sozinho o recolher/
 * expandir, e ignora a sidebar quando ela é um drawer mobile (`position:
 * fixed`, não desloca o conteúdo) ou está escondida (`display: none`).
 */
export function useContentAreaCenterOffset(): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const sidebar = document.querySelector<HTMLElement>('[data-testid="sidebar-root"]');
    if (!sidebar) return;

    const recompute = () => {
      const style = window.getComputedStyle(sidebar);
      const isOverlay = style.position === 'fixed'; // drawer mobile — não desloca o conteúdo
      const isHidden = style.display === 'none';
      const width = isOverlay || isHidden ? 0 : sidebar.getBoundingClientRect().width;
      setOffset(width / 2);
    };

    recompute();
    const resizeObserver = new ResizeObserver(recompute);
    resizeObserver.observe(sidebar);
    window.addEventListener('resize', recompute);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', recompute);
    };
  }, []);

  return offset;
}
