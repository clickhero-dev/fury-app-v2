import { useState } from 'react';
import type { FormEvent } from 'react';
import { Sparkles } from 'lucide-react';

const locationChoices = [
  { value: 'city', label: 'São Paulo, SP' },
  { value: 'state', label: 'Estado de São Paulo' },
  { value: 'country', label: 'Brasil' },
] as const;

export function GoogleAdsCampaignMockPage({ onBack }: { onBack?: () => void }) {
  const [objective, setObjective] = useState('leads');
  const [location, setLocation] = useState<(typeof locationChoices)[number]['value']>('city');
  const [headlines, setHeadlines] = useState(['', '', '']);
  const [longHeadline, setLongHeadline] = useState('');
  const [descriptions, setDescriptions] = useState(['', '']);
  const [destinationUrl, setDestinationUrl] = useState('');
  const [dailyBudget, setDailyBudget] = useState('20');
  const [imageUrls, setImageUrls] = useState(['', '']);
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-border bg-surface p-5 sm:p-6">
      {onBack && <button type="button" onClick={onBack} className="text-sm font-semibold text-text-secondary">← Voltar</button>}
      <div>
        <div className="flex items-center gap-2"><Sparkles aria-hidden="true" className="size-5 text-brand" /><h2 className="text-lg font-bold text-text-primary">Criar campanha no Google</h2></div>
        <p className="mt-1 text-sm text-text-secondary">Prepare os detalhes do anúncio para revisar.</p>
      </div>
      <p className="rounded-xl border border-accent/20 bg-accent/5 p-3 text-sm text-text-secondary">Demonstração: os dados são fictícios e nenhum anúncio será publicado.</p>

      <label className="block text-sm font-medium text-text-primary">Conta Google Ads<select aria-label="Conta Google Ads" defaultValue="123-456-7890" className="mt-1 w-full rounded-xl border border-border bg-surface-secondary px-3 py-2 text-text-primary"><option value="123-456-7890">Padaria Modelo · 123-456-7890 (exemplo)</option></select></label>
      <label className="block text-sm font-medium text-text-primary">Objetivo<select aria-label="Objetivo" value={objective} onChange={(event) => setObjective(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-surface-secondary px-3 py-2 text-text-primary"><option value="leads">Receber contatos</option><option value="website">Receber visitas no site</option><option value="calls">Receber ligações</option></select></label>
      <fieldset><legend className="text-sm font-medium text-text-primary">Onde anunciar</legend><div className="mt-2 grid gap-2 sm:grid-cols-3">{locationChoices.map((choice) => <label key={choice.value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-text-primary"><input type="radio" name="mock-location" checked={location === choice.value} onChange={() => setLocation(choice.value)} />{choice.label}</label>)}</div></fieldset>

      {headlines.map((value, index) => <label key={`headline-${index}`} className="block text-sm font-medium text-text-primary">Título do anúncio {index + 1}<input required maxLength={30} aria-label={`Título do anúncio ${index + 1}`} value={value} onChange={(event) => setHeadlines((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} className="mt-1 w-full rounded-xl border border-border bg-surface-secondary px-3 py-2 text-text-primary" /></label>)}
      <label className="block text-sm font-medium text-text-primary">Título longo<input required maxLength={90} aria-label="Título longo" value={longHeadline} onChange={(event) => setLongHeadline(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-surface-secondary px-3 py-2 text-text-primary" /></label>
      {descriptions.map((value, index) => <label key={`description-${index}`} className="block text-sm font-medium text-text-primary">Descrição {index + 1}<textarea required maxLength={90} aria-label={`Descrição ${index + 1}`} value={value} onChange={(event) => setDescriptions((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} className="mt-1 min-h-24 w-full rounded-xl border border-border bg-surface-secondary px-3 py-2 text-text-primary" /></label>)}
      <label className="block text-sm font-medium text-text-primary">Site de destino<input required type="url" aria-label="Site de destino" value={destinationUrl} onChange={(event) => setDestinationUrl(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-surface-secondary px-3 py-2 text-text-primary" placeholder="https://suaempresa.com.br" /></label>
      <label className="block text-sm font-medium text-text-primary">Orçamento diário (R$)<input required min="1" step="0.01" type="number" aria-label="Orçamento diário (R$)" value={dailyBudget} onChange={(event) => setDailyBudget(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-surface-secondary px-3 py-2 text-text-primary" /></label>
      {imageUrls.map((value, index) => <label key={`image-${index}`} className="block text-sm font-medium text-text-primary">{index === 0 ? 'Imagem paisagem (1,91:1)' : 'Imagem quadrada (1:1)'}<input required type="url" aria-label={index === 0 ? 'Imagem paisagem (1,91:1)' : 'Imagem quadrada (1:1)'} value={value} onChange={(event) => setImageUrls((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} className="mt-1 w-full rounded-xl border border-border bg-surface-secondary px-3 py-2 text-text-primary" placeholder="https://..." /></label>)}

      {submitted && <p role="status" className="rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-text-primary">Campanha pronta para revisão. Ela não foi publicada no Google.</p>}
      <button type="submit" className="w-full rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white">Simular criação</button>
    </form>
  );
}
