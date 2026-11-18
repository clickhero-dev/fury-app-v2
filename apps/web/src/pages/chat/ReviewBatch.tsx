import { useLayoutEffect, useRef, useState } from 'react';
import type { BatchMedia } from './batch-presentation';

/** UI ports: an adapter must retain the server's opaque reviewed snapshot. */
export type BatchCandidate = { id: string; revision: string; title: string; details: string };
export type BatchReview = {
  token: string;
  consumptionSummary?: {image:number;video:number;unknownItems:number};
  items: { id: string; title: string; details: string; effect: string; quota: string | null; advancedDetails?: string; media?: BatchMedia[] }[];
};
export type BatchItemResult = {
  id: string; title?: string; status: 'completed' | 'failed' | 'uncertain' | 'pending'; message: string;
  evidence?: { imageUrl?: string; videoUrl?: string; jobId?: string; code?: string; error?: string };
};
export type ReviewBatchProps = {
  items: BatchCandidate[];
  disabled?: boolean;
  onReview: (ids: string[]) => Promise<BatchReview>;
  onConfirm: (snapshot: BatchReview) => Promise<BatchItemResult[]>;
};

export function ReviewBatch({ items, disabled = false, onReview, onConfirm }: ReviewBatchProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [review, setReview] = useState<{ fingerprint: string; snapshot: BatchReview } | null>(null);
  const [results, setResults] = useState<BatchItemResult[]>([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [invalidated, setInvalidated] = useState(false);
  const selectedItems = items.filter(item => selected.includes(item.id));
  const fingerprint = JSON.stringify(selectedItems);
  const currentFingerprint = useRef<string | null>(fingerprint);
  const [previousFingerprint, setPreviousFingerprint] = useState(fingerprint);
  if (previousFingerprint !== fingerprint) {
    setPreviousFingerprint(fingerprint);
    if (review) { setReview(null); setInvalidated(true); }
  }
  useLayoutEffect(() => {
    currentFingerprint.current = fingerprint;
    return () => { currentFingerprint.current = null; };
  }, [fingerprint]);
  const validReview = review?.fingerprint === fingerprint ? review.snapshot : null;
  const consumption = validReview?.consumptionSummary;
  const knownConsumption = consumption ? [
    consumption.image ? `${consumption.image} ${consumption.image === 1 ? 'imagem' : 'imagens'}` : '',
    consumption.video ? `${consumption.video} ${consumption.video === 1 ? 'vídeo' : 'vídeos'}` : '',
  ].filter(Boolean).join(' e ') : '';
  const locked = new Set(results.map(result => result.id));
  const eligible = !disabled && selectedItems.length > 0 && selectedItems.length <= 10
    && selectedItems.length === selected.length && selected.every(id => !locked.has(id));

  async function prepare() {
    if (busyRef.current || !eligible) return;
    busyRef.current = true;
    setBusy(true); setError(''); setReview(null); setInvalidated(false);
    const captured = fingerprint;
    try {
      const snapshot = await onReview(selectedItems.map(item => item.id));
      if (currentFingerprint.current !== captured) return;
      const ids = snapshot.items.map(item => item.id);
      if (!snapshot.token || ids.length !== selected.length || new Set(ids).size !== ids.length
        || ids.some(id => !selected.includes(id))) throw new Error('Invalid snapshot');
      setReview({ fingerprint: captured, snapshot });
    } catch {
      if (currentFingerprint.current === captured) setError('Não foi possível revisar. Atualize os itens e tente novamente.');
    } finally {
      busyRef.current = false; setBusy(false);
    }
  }
  async function confirm() {
    if (busyRef.current || !validReview || !eligible) return;
    busyRef.current = true; setBusy(true); setError('');
    const snapshot = validReview;
    setReview(null);
    const uncertain = (id: string): BatchItemResult => ({
      id, status: 'uncertain', message: 'Resultado não confirmado. Verifique o status antes de qualquer nova tentativa.',
    });
    try {
      const received = await onConfirm(snapshot);
      // Missing/duplicate results are uncertain, never successful by omission.
      const reconciled = snapshot.items.map(item => {
        const matches = received.filter(result => result.id === item.id);
        return { ...(matches.length === 1 ? matches[0] : uncertain(item.id)), title: item.title };
      });
      setResults(previous => [...previous.filter(result => !snapshot.items.some(item => item.id === result.id)), ...reconciled]);
    } catch {
      setResults(previous => [...previous, ...snapshot.items.map(item => ({ ...uncertain(item.id), title: item.title }))]);
    } finally {
      busyRef.current = false; setBusy(false);
    }
  }
  return <section className="ady-chat-batch" aria-label="Revisar ações em lote" aria-busy={busy}>
    <h3>Revisar ações</h3>
    <p>Selecione até 10 ações. Aprovar um plano não autoriza gerar mídia ou publicar.</p>
    <ul>{items.map(item => <li key={item.id}>
      <label><input type="checkbox" checked={selected.includes(item.id)}
        disabled={disabled || busy || locked.has(item.id) || (!selected.includes(item.id) && selected.length >= 10)}
        onChange={event => {
          setReview(null); setInvalidated(true);
          setSelected(previous => event.target.checked ? [...previous, item.id] : previous.filter(id => id !== item.id));
        }}/>
        {item.title}</label>
      {item.details && <p>{item.details}</p>}
    </li>)}</ul>
    {!!results.length && <ul aria-label="Resultados do lote">{results.map(result => <li key={result.id} role="status" data-status={result.status}>
      {(result.title || items.find(item => item.id === result.id)?.title) && <strong>{result.title || items.find(item => item.id === result.id)?.title}: </strong>}{result.message}
    </li>)}</ul>}
    {invalidated && <p role="status">Os itens mudaram; revise novamente antes de confirmar.</p>}
    {error && <p role="alert">{error}</p>}
    {validReview && <div aria-label="Snapshot revisado">
      {consumption && <div aria-label="Consumo do lote">
        <p>Consumo total conhecido: {knownConsumption || 'não informado'}.</p>
        {consumption.unknownItems > 0 && <p>Há {consumption.unknownItems} {consumption.unknownItems === 1 ? 'item' : 'itens'} com consumo não informado.</p>}
      </div>}
      {validReview.items.map(item => <article key={item.id}>
        <h4>{item.title}</h4><p>{item.details}</p><p>{item.effect}</p><p>{item.quota ?? 'Cota não informada'}</p>
        {item.media?.map((media,index) => media.kind === 'image'
          ? <img key={`${media.kind}:${media.url}`} src={media.url} alt={`Prévia da imagem proposta — ${item.title} (${index + 1})`} loading="lazy" referrerPolicy="no-referrer"/>
          : <video key={`${media.kind}:${media.url}`} src={media.url} aria-label={`Prévia do vídeo proposto — ${item.title} (${index + 1})`} controls preload="none"/>)}
        {item.advancedDetails && <details><summary>Detalhes técnicos de {item.title}</summary><p>{item.advancedDetails}</p></details>}
      </article>)}
      <button type="button" disabled={busy || !eligible} onClick={() => void confirm()}>Confirmar {validReview.items.length} ações revisadas</button>
    </div>}
    {!validReview && <button type="button" disabled={busy || !eligible} onClick={() => void prepare()}>Revisar selecionados</button>}
  </section>;
}
