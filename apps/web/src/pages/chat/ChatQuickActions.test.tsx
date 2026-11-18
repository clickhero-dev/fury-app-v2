import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatQuickActions } from './ChatQuickActions';

const actions=[['Não sei o que postar','próximo post'],['Organizar minha semana','semana'],['Usar uma foto minha','foto']];
describe('Pedidos diretos com sugestões contextuais opcionais',()=>{
  it('preserva três pedidos, um principal; montagem não envia nem abre briefing',()=>{
    const onSelect=vi.fn();
    const view=render(<ChatQuickActions onSelect={onSelect}/>);
    expect(within(screen.getByRole('group',{name:'Ações para começar'})).getAllByRole('button').map(button=>button.textContent?.trim())).toEqual(actions.map(([label])=>label));
    expect(screen.getByRole('button',{name:actions[0][0]})).toHaveClass('ady-chat-quick-primary');
    expect(screen.queryByRole('textbox')).toBeNull();
    view.unmount();render(<ChatQuickActions onSelect={onSelect}/>);
    expect(onSelect).not.toHaveBeenCalled();
  });
  it.each(actions)('%s inicia preparação imediatamente sem resposta obrigatória',(label,deliverable)=>{
    const onSelect=vi.fn();
    render(<ChatQuickActions onSelect={onSelect}/>);
    fireEvent.click(screen.getByRole('button',{name:label,exact:true}));
    expect(onSelect).toHaveBeenCalledTimes(1);
    const prompt=onSelect.mock.calls[0][0];
    expect(prompt).toContain(deliverable);
    expect(prompt).toContain('contexto autorizado');
    expect(prompt).toContain('Não faça perguntas opcionais');
    expect(prompt).toContain('confirmação explícita');
    expect(prompt).toContain('não autoriza publicar, agendar, investir em mídia paga');
    expect(screen.queryByRole('textbox')).toBeNull();
  });
  it('foto só pede anexo se faltar; contexto não inventa foto recebida',()=>{
    const onSelect=vi.fn();
    render(<ChatQuickActions onSelect={onSelect}/>);
    fireEvent.click(screen.getByRole('button',{name:'Usar uma foto minha'}));
    expect(onSelect).toHaveBeenCalledWith(expect.stringContaining('Se não houver foto anexada'));
  });
  it('oferece uma entrada opcional para conhecer o negócio sem abrir formulário',()=>{
    const onSelect=vi.fn();
    render(<ChatQuickActions onSelect={onSelect}/>);
    fireEvent.click(screen.getByRole('button',{name:'Configurar meu negócio'}));
    expect(onSelect).toHaveBeenCalledWith(expect.stringContaining('ajuda guiada'));
    expect(screen.queryByRole('textbox')).toBeNull();
  });
  it('preserva sugestões PR465 nome/cidade sem enviar até escolha; clique duplicado não repete',async()=>{
    let resolve!:()=>void;
    const onSelect=vi.fn(()=>new Promise<void>(done=>{resolve=done;}));
    const onExplore=vi.fn();
    render(<ChatQuickActions onSelect={onSelect} onExplore={onExplore} context={{tenantName:'Flores da Ana',city:'Recife'}}/>);
    fireEvent.click(screen.getByRole('button',{name:'Outras ideias para meu negócio'}));
    expect(onExplore).toHaveBeenCalledTimes(1);
    const option=screen.getByRole('button',{name:'Apresentar Flores da Ana em Recife'});
    expect(screen.getByRole('group',{name:'Sugestões para meu negócio'}).querySelectorAll('button')).toHaveLength(3);
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(option);fireEvent.click(option);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toContain('Apresentar Flores da Ana em Recife');
    await act(async()=>resolve());
  });
  it('opções sem perfil não inventam nome/cidade e podem ser fechadas sem envio',()=>{
    const onSelect=vi.fn();
    render(<ChatQuickActions onSelect={onSelect}/>);
    fireEvent.click(screen.getByRole('button',{name:'Outras ideias para meu negócio'}));
    expect(screen.getByRole('button',{name:'Apresentar meu negócio'})).toBeEnabled();
    fireEvent.click(screen.getByRole('button',{name:'Ocultar outras ideias'}));
    expect(screen.queryByRole('group',{name:'Sugestões para meu negócio'})).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });
  it('teclado expande e seleciona sem pergunta nem formulário extra',async()=>{
    const user=userEvent.setup(),onSelect=vi.fn().mockResolvedValue(undefined);
    render(<ChatQuickActions onSelect={onSelect} context={{tenantName:'Flores',city:'Recife'}}/>);
    await user.click(screen.getByRole('button',{name:'Outras ideias para meu negócio'}));
    await user.tab();
    expect(screen.getByRole('button',{name:'Apresentar Flores em Recife'})).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
  it('contexto HTML é texto, nunca elemento executável',()=>{
    render(<ChatQuickActions onSelect={vi.fn()} context={{tenantName:'<img src=x onerror=alert(1)>',city:'<Recife>'}}/>);
    fireEvent.click(screen.getByRole('button',{name:'Outras ideias para meu negócio'}));
    expect(screen.getByRole('button',{name:'Apresentar <img src=x onerror=alert(1)> em <Recife>'})).toBeVisible();
    expect(document.querySelector('img')).toBeNull();
  });
  it('ocupado desabilita pedidos e expansão sem enviar',()=>{
    const onSelect=vi.fn();
    render(<ChatQuickActions onSelect={onSelect} disabled/>);
    screen.getAllByRole('button').forEach(button=>{expect(button).toBeDisabled();fireEvent.click(button);});
    expect(onSelect).not.toHaveBeenCalled();
  });
});
