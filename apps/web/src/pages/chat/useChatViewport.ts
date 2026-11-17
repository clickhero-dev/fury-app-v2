import { useLayoutEffect, type RefObject } from 'react';

/** Keep the mobile chat inside the keyboard's visible viewport without scrolling ancestors. */
export function useChatViewport(root: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    const element = root.current;
    if (!viewport || !element) return;
    const update = () => {
      // Pinch zoom should remain a browser operation, not reflow the conversation.
      if (viewport.scale !== 1) return;
      element.style.setProperty('--chat-viewport-height', `${viewport.height}px`);
      element.style.setProperty('--chat-viewport-top', `${viewport.offsetTop}px`);
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, [root]);
}
