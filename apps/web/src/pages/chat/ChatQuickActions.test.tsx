import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatQuickActions } from './ChatQuickActions';

describe('ações rápidas do chat', () => {
  it('oferece quatro sugestões que apenas preenchem o rascunho', () => {
    const onSelect = vi.fn();
    render(<ChatQuickActions onSelect={onSelect}/>);
    const suggestions = [
      ['Planejar postagens do mês', 'Quero planejar as postagens do mês'],
      ['Criar campanha', 'Quero criar uma campanha paga ou orgânica'],
      ['Criar vídeos', 'Quero criar um vídeo'],
      ['Criar imagens', 'Quero criar uma imagem'],
    ];
    for (const [label, prompt] of suggestions) {
      fireEvent.click(screen.getByRole('button', {name: label}));
      expect(onSelect).toHaveBeenLastCalledWith(prompt);
    }
    expect(onSelect).toHaveBeenCalledTimes(4);
  });
  it('identifica o grupo e permite ativar sugestões por teclado', async () => {
    const onSelect = vi.fn();
    render(<ChatQuickActions onSelect={onSelect}/>);
    const group = screen.getByRole('group', {name: 'Sugestões para começar'});
    expect(group).toBeInTheDocument();
    screen.getByRole('button', {name: 'Criar imagens'}).focus();
    expect(screen.getByRole('button', {name: 'Criar imagens'})).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('Quero criar uma imagem');
  });
  it('não permite seleção enquanto desabilitado', () => {
    const onSelect = vi.fn();
    render(<ChatQuickActions onSelect={onSelect} disabled/>);
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(onSelect).not.toHaveBeenCalled();
  });
});
