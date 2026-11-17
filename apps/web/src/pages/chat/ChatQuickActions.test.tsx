import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatQuickActions } from './ChatQuickActions';

const labels = ['Criar post para o Instagram', 'Agendar posts da semana', 'Criar Reels para o Instagram', 'Criar vídeo para o negócio', 'Aumentar seguidores no Instagram', 'Atrair clientes pelo WhatsApp'];
describe('Funcionalidade: iniciar ações guiadas do Ady', () => {
  it.each(labels)('Quando toca em %s Então abre uma etapa específica sem enviar nem consumir cota', label => {
    const onSelect = vi.fn();
    render(<ChatQuickActions onSelect={onSelect}/>);
    fireEvent.click(screen.getByRole('button', {name:label, exact:true}));
    expect(screen.getByRole('heading', {name:label})).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(screen.getByRole('button', {name:'Continuar com Ady'})).toBeDisabled();
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox'), {target:{value:'Meu negócio de flores'}});
    fireEvent.click(screen.getByRole('button', {name:'Continuar com Ady'}));
    expect(onSelect).toHaveBeenCalledWith(expect.stringContaining('Meu negócio de flores'));
    expect(onSelect).toHaveBeenCalledWith(expect.stringContaining('confirmação'));
  });
  it('Dado um fluxo aberto Quando cancela Então retorna aos seis atalhos sem enviar', () => {
    const onSelect = vi.fn(); render(<ChatQuickActions onSelect={onSelect}/>);
    fireEvent.click(screen.getByRole('button', {name:labels[0]}));
    fireEvent.click(screen.getByRole('button', {name:'Cancelar'}));
    expect(screen.getAllByRole('button')).toHaveLength(6);
    expect(onSelect).not.toHaveBeenCalled();
  });
  it('Dado que está ocupado Então não permite iniciar ações', () => {
    render(<ChatQuickActions onSelect={vi.fn()} disabled/>);
    screen.getAllByRole('button').forEach(button => expect(button).toBeDisabled());
  });
});
