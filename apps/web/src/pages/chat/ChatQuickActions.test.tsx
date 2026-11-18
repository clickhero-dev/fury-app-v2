import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatQuickActions } from './ChatQuickActions';
import type { QuickAction } from './quick-actions';

const labels = ['Criar post para o Instagram', 'Agendar posts da semana', 'Criar Reels para o Instagram', 'Criar vídeo para o negócio', 'Aumentar seguidores no Instagram', 'Atrair clientes pelo WhatsApp'];
function Harness({onSelect = vi.fn(), disabled = false, context = {tenantName:'Flores da Ana', city:'Recife'}}: {onSelect?: (answer:string) => Promise<void>; disabled?:boolean; context?:{tenantName?:string; city?:string}}) {
  const [selected, onChange] = useState<QuickAction | null>(null);
  return <ChatQuickActions {...{selected,onChange,onSelect,disabled,context}}/>;
}
describe('Funcionalidade: iniciar ações guiadas do Ady com sugestões', () => {
  it.each(labels)('Quando toca em %s Então oferece três opções sem formulário nem envio', label => {
    const onSelect = vi.fn(); render(<Harness onSelect={onSelect}/>);
    fireEvent.click(screen.getByRole('button', {name:label, exact:true}));
    expect(screen.getByRole('heading', {name:label})).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name:'Continuar com Ady'})).not.toBeInTheDocument();
    expect(screen.getByRole('group', {name:/\?/}).querySelectorAll('button')).toHaveLength(3);
    expect(screen.getByText(/compositor.*Mensagem/)).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });
  it('Dado negócio e cidade Quando abre Reels Então as intenções refletem o contexto e selecionam uma única vez', async () => {
    let resolve!: () => void;
    const onSelect = vi.fn(() => new Promise<void>(r => {resolve=r;}));
    render(<Harness onSelect={onSelect}/>);
    fireEvent.click(screen.getByRole('button', {name:labels[2]}));
    const suggestion = screen.getByRole('button', {name:'Apresentar Flores da Ana para atrair clientes em Recife'});
    fireEvent.click(suggestion); fireEvent.click(suggestion);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('Apresentar Flores da Ana para atrair clientes em Recife');
    await act(async () => resolve());
  });
  it('Dado contexto ausente Quando escolhe Reels Então oferece intenções sem inventar negócio ou cidade', () => {
    render(<Harness context={{}}/>);
    fireEvent.click(screen.getByRole('button', {name:labels[2]}));
    expect(screen.getByRole('button', {name:'Apresentar meu negócio para atrair clientes'})).toBeEnabled();
    expect(screen.getByRole('button', {name:'Compartilhar dicas para engajar meu público'})).toBeEnabled();
  });
  it('Dado teclado Quando abre e avança Então a pergunta recebe foco e Enter seleciona a sugestão', async () => {
    const user = userEvent.setup(); const onSelect = vi.fn().mockResolvedValue(undefined);
    render(<Harness onSelect={onSelect}/>);
    await user.click(screen.getByRole('button', {name:labels[2]}));
    expect(screen.getByText('Qual é o tema e o objetivo do Reels?')).toHaveFocus();
    await user.tab(); expect(screen.getByRole('button', {name:/Apresentar Flores/})).toHaveFocus();
    await user.keyboard('{Enter}'); expect(onSelect).toHaveBeenCalledTimes(1);
  });
  it('Dado um fluxo aberto Quando cancela Então retorna aos seis atalhos sem enviar', () => {
    const onSelect = vi.fn(); render(<Harness onSelect={onSelect}/>);
    fireEvent.click(screen.getByRole('button', {name:labels[0]}));
    fireEvent.click(screen.getByRole('button', {name:'Cancelar'}));
    expect(screen.getAllByRole('button')).toHaveLength(6); expect(onSelect).not.toHaveBeenCalled();
  });
  it('Dado que está ocupado Então não permite iniciar ações', () => {
    render(<Harness disabled/>);
    screen.getAllByRole('button').forEach(button => expect(button).toBeDisabled());
  });
});
