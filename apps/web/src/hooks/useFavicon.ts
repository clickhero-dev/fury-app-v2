import { useEffect } from 'react';

export function useFavicon(adminFaviconUrl: string, adminTitle?: string) {
  useEffect(() => {
    // 1. Guarda e altera o título da aba
    const originalTitle = document.title;
    if (adminTitle) {
      document.title = adminTitle;
    }

    // 2. Busca e altera o favicon
    let linkElement: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
    const originalHref = linkElement?.href || '/favicon.svg';
    const originalType = linkElement?.type || 'image/svg+xml';

    if (!linkElement) {
      linkElement = document.createElement('link');
      linkElement.rel = 'icon';
      document.head.appendChild(linkElement);
    }

    linkElement.type = 'image/svg+xml';
    linkElement.href = adminFaviconUrl;

    // 3. Cleanup: Restaura título e favicon originais ao sair do Admin
    return () => {
      document.title = originalTitle;
      if (linkElement) {
        linkElement.type = originalType;
        linkElement.href = originalHref;
      }
    };
  }, [adminFaviconUrl, adminTitle]);
}