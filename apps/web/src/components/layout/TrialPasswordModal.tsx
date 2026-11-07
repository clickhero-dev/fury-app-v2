import { useState } from 'react';
import api from '../../lib/api';

export function TrialPasswordModal({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (password.length < 8) return setError('A senha deve ter pelo menos 8 caracteres.');
    if (password !== confirmation) return setError('As senhas precisam ser iguais.');
    setSaving(true);
    setError('');
    try {
      await api.post('/auth/set-password', { newPassword: password });
      onComplete();
    } catch {
      setError('Não foi possível salvar sua senha. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="trial-password-title">
    <section className="w-full max-w-md rounded-2xl bg-background p-6 shadow-xl">
      <h2 id="trial-password-title" className="text-xl font-semibold">Crie sua senha</h2>
      <p className="mt-2 text-sm text-text-secondary">Defina uma senha nova para continuar usando sua conta.</p>
      <label className="mt-5 block text-sm font-medium" htmlFor="trial-password">Nova senha</label>
      <input id="trial-password" aria-label="Nova senha" className="mt-1 w-full rounded-lg border bg-transparent p-3" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
      <label className="mt-4 block text-sm font-medium" htmlFor="trial-password-confirm">Confirmar senha</label>
      <input id="trial-password-confirm" aria-label="Confirmar senha" className="mt-1 w-full rounded-lg border bg-transparent p-3" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
      {error && <p className="mt-3 text-sm text-error" role="alert">{error}</p>}
      <button className="mt-5 w-full rounded-lg bg-brand px-4 py-3 text-white" type="button" disabled={saving} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar senha'}</button>
    </section>
  </div>;
}
