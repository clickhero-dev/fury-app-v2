import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useChatViewport } from './useChatViewport';
/*
Funcionalidade: adaptar o chat ao teclado virtual
Cenário: abrir e fechar teclado preserva a altura visível
Cenário: navegador sem VisualViewport mantém fallback CSS
Cenário: zoom não reduz artificialmente o chat
*/
function Harness() { const ref = useRef<HTMLDivElement>(null); useChatViewport(ref); return <div ref={ref} data-testid="chat"/>; }
describe('viewport do chat',()=>{
  it('atualiza geometria no resize e scroll e remove listeners ao sair',()=>{
    const viewport = new EventTarget();
    Object.assign(viewport,{height:480,offsetTop:24,scale:1});
    vi.stubGlobal('visualViewport',viewport);
    const {getByTestId,unmount}=render(<Harness/>);
    const root=getByTestId('chat');
    expect(root.style.getPropertyValue('--chat-viewport-height')).toBe('480px');
    expect(root.style.getPropertyValue('--chat-viewport-top')).toBe('24px');
    act(()=>{Object.assign(viewport,{height:844,offsetTop:0});viewport.dispatchEvent(new Event('resize'));});
    expect(root.style.getPropertyValue('--chat-viewport-height')).toBe('844px');
    act(()=>{Object.assign(viewport,{height:300,scale:2});viewport.dispatchEvent(new Event('scroll'));});
    expect(root.style.getPropertyValue('--chat-viewport-height')).toBe('844px');
    unmount();
    Object.assign(viewport,{height:500,scale:1});viewport.dispatchEvent(new Event('resize'));
    expect(root.style.getPropertyValue('--chat-viewport-height')).toBe('844px');
    vi.unstubAllGlobals();
  });
  it('usa CSS quando VisualViewport está indisponível',()=>{
    vi.stubGlobal('visualViewport',undefined);
    const {getByTestId}=render(<Harness/>);
    expect(getByTestId('chat').style.getPropertyValue('--chat-viewport-height')).toBe('');
    vi.unstubAllGlobals();
  });
});
