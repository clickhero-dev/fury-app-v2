// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReviewBatch, type BatchReview, type ReviewBatchProps } from './ReviewBatch';

afterEach(cleanup);
const items = [
  { id: 'a', revision: '1', title: 'Criar imagem', details: 'Café na praia' },
  { id: 'b', revision: '1', title: 'Publicar post', details: 'Instagram amanhã' },
];
const snapshot: BatchReview = {
  token: 'snapshot-1', items: [
    { id: 'a', title: 'Criar imagem', details: 'Café na praia', effect: 'Gera uma imagem, não publica.', quota: '1 crédito' },
    { id: 'b', title: 'Publicar post', details: 'Instagram amanhã', effect: 'Publica no Instagram.', quota: null },
  ],
};
function props(extra: Partial<ReviewBatchProps> = {}): ReviewBatchProps {
  return { items, onReview: vi.fn().mockResolvedValue(snapshot), onConfirm: vi.fn().mockResolvedValue([{ id: 'a', status: 'completed', message: 'Imagem pronta' }, { id: 'b', status: 'uncertain', message: 'Verifique o Instagram antes de tentar novamente.' }]), ...extra };
}
function select() {
  fireEvent.click(screen.getByRole('checkbox', { name: 'Criar imagem' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Publicar post' }));
}
describe('Revisão consolidada', () => {
  it('mostra prévia acessível e mantém informações técnicas recolhidas sem mudar snapshot',async()=>{
    const review:BatchReview={...snapshot,items:snapshot.items.map((item,index)=>index?item:{...item,advancedDetails:'Modelo: model-uuid',media:[{kind:'image',url:'https://example.test/proposta.png'},{kind:'video',url:'https://example.test/proposta.mp4'}]})};
    const input=props({onReview:vi.fn().mockResolvedValue(review)});
    render(<ReviewBatch {...input}/>);
    select();
    fireEvent.click(screen.getByRole('button',{name:'Revisar selecionados'}));
    const image=await screen.findByRole('img',{name:/Prévia da imagem proposta/});
    expect(image).toHaveAttribute('src','https://example.test/proposta.png');
    expect(screen.getByLabelText(/Prévia do vídeo proposto/)).toHaveAttribute('controls');
    expect(screen.getByText('Modelo: model-uuid')).not.toBeVisible();
    fireEvent.click(screen.getByText('Detalhes técnicos de Criar imagem'));
    expect(screen.getByText('Modelo: model-uuid')).toBeVisible();
    fireEvent.click(screen.getByRole('button',{name:'Confirmar 2 ações revisadas'}));
    await waitFor(()=>expect(input.onConfirm).toHaveBeenCalledTimes(1));
    expect(vi.mocked(input.onConfirm).mock.calls[0][0]).toBe(review);
  });
  it('revisa seleção e confirma somente snapshot; distingue cota desconhecida e resultados parciais', async () => {
    const input = props();
    render(<ReviewBatch {...input}/>);
    expect(screen.getByRole('button', { name: 'Revisar selecionados' })).toBeDisabled();
    select();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar selecionados' }));
    await screen.findByText('1 crédito');
    expect(screen.getByText('Cota não informada')).toBeVisible();
    expect(screen.getByText('Gera uma imagem, não publica.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar 2 ações revisadas' }));
    await screen.findByText('Imagem pronta');
    expect(input.onConfirm).toHaveBeenCalledExactlyOnceWith(snapshot);
    expect(screen.getByText(/Verifique o Instagram/)).toBeVisible();
    expect(screen.queryByRole('button', { name: /Confirmar/ })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Publicar post' })).toBeDisabled();
  });
  it('invalida revisão quando parâmetros ou seleção mudam', async () => {
    const input = props();
    const view = render(<ReviewBatch {...input}/>);
    select();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar selecionados' }));
    await screen.findByRole('button', { name: /Confirmar 2/ });
    view.rerender(<ReviewBatch {...input} items={[{ ...items[0], details: 'Outro pedido' }, items[1]]}/>);
    expect(screen.queryByRole('button', { name: /Confirmar/ })).toBeNull();
    expect(screen.getByText(/revise novamente/i)).toBeVisible();
  });
  it('não aceita snapshot de outro conjunto e mantém erro de revisão sem executar', async () => {
    const input = props({ onReview: vi.fn().mockResolvedValue({ ...snapshot, items: [snapshot.items[0]] }) });
    render(<ReviewBatch {...input}/>);
    select();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar selecionados' }));
    await screen.findByRole('alert');
    expect(input.onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Confirmar/ })).toBeNull();
  });
  it('limita seleção a dez itens', () => {
    render(<ReviewBatch {...props()} items={Array.from({ length: 11 }, (_, n) => ({ id: String(n), revision: '1', title: `Ação ${n}`, details: '' }))}/>);
    for (let n = 0; n < 10; n++) fireEvent.click(screen.getByRole('checkbox', { name: `Ação ${n}`, exact: true }));
    expect(screen.getByRole('checkbox', { name: 'Ação 10', exact: true })).toBeDisabled();
  });
  it('alterar e restaurar seleção não ressuscita revisão antiga', async () => {
    render(<ReviewBatch {...props()}/>);
    select();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar selecionados' }));
    await screen.findByRole('button', { name: /Confirmar 2/ });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Publicar post' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Publicar post' }));
    expect(screen.queryByRole('button', { name: /Confirmar/ })).toBeNull();
  });
  it('descarta revisão tardia após mudar seleção; não inventa sucesso para resultado ausente', async () => {
    let resolve!: (review: BatchReview) => void;
    const input = props({ onReview: vi.fn().mockImplementationOnce(() => new Promise<BatchReview>(done => { resolve = done; })).mockResolvedValue(snapshot), onConfirm: vi.fn().mockResolvedValue([{ id: 'a', status: 'completed', message: 'Imagem pronta' }]) });
    const view = render(<ReviewBatch {...input}/>);
    select();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar selecionados' }));
    view.rerender(<ReviewBatch {...input} items={[{ ...items[0], revision: '2' }, items[1]]}/>);
    resolve(snapshot);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Revisar selecionados' })).toBeEnabled());
    expect(screen.queryByRole('button', { name: /Confirmar/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar selecionados' }));
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar 2/ }));
    expect(await screen.findByText(/Resultado não confirmado/)).toBeVisible();
    expect(screen.getByText('Imagem pronta')).toBeVisible();
  });
  it('falha de confirmação é incerta, preserva itens e não oferece retry automático', async () => {
    render(<ReviewBatch {...props({ onConfirm: vi.fn().mockRejectedValue(new Error('network')) })}/>);
    select();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar selecionados' }));
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar 2/ }));
    await waitFor(() => expect(screen.getAllByText(/Resultado não confirmado/)).toHaveLength(2));
    expect(screen.getByRole('checkbox', { name: 'Criar imagem' })).toBeDisabled();
  });
});
