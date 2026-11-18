import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatQuickActions } from './ChatQuickActions';

const actions = [
  ['Não sei o que postar', 'próximo post'],
  ['Organizar minha semana', 'semana'],
  ['Usar uma foto minha', 'foto'],
];
describe('Começar com um pedido, sem briefing obrigatório', () => {
  it('oferece uma ação principal e duas secundárias sem enviar na montagem ou remontagem', () => {
    const onSelect = vi.fn();
    const { unmount } = render(<ChatQuickActions onSelect={onSelect}/>);
    expect(screen.getAllByRole('button').map(button => button.textContent?.trim())).toEqual(actions.map(([label]) => label));
    expect(screen.getByRole('button', {name:actions[0][0]})).toHaveClass('ady-chat-quick-primary');
    unmount();
    render(<ChatQuickActions onSelect={onSelect}/>);
    expect(onSelect).not.toHaveBeenCalled();
  });
  it.each(actions)('%s inicia diretamente a preparação sem exigir respostas', (label, deliverable) => {
    const onSelect = vi.fn();
    render(<ChatQuickActions onSelect={onSelect}/>);
    fireEvent.click(screen.getByRole('button', {name:label, exact:true}));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(onSelect).toHaveBeenCalledTimes(1);
    const prompt = onSelect.mock.calls[0][0];
    expect(prompt).toContain(deliverable);
    expect(prompt).toContain('contexto autorizado');
    expect(prompt).toContain('Não faça perguntas opcionais');
    expect(prompt).toContain('não autoriza publicar, agendar, investir em mídia paga');
    expect(prompt).toContain('confirmação explícita');
    expect(prompt).toContain('Não invente');
  });
  it('foto pede anexo somente se estiver faltando, sem inventar que recebeu uma imagem', () => {
    const onSelect = vi.fn();
    render(<ChatQuickActions onSelect={onSelect}/>);
    fireEvent.click(screen.getByRole('button', {name:'Usar uma foto minha'}));
    expect(onSelect).toHaveBeenCalledWith(expect.stringContaining('Se não houver foto anexada, peça apenas que eu anexe a foto'));
  });
  it('ocupado não permite enviar nenhum dos pedidos', () => {
    const onSelect = vi.fn();
    render(<ChatQuickActions onSelect={onSelect} disabled/>);
    screen.getAllByRole('button').forEach(button => {
      expect(button).toBeDisabled();
      fireEvent.click(button);
    });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
