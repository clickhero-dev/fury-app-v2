import { useState } from 'react';
import { PASSWORD_RULES, passwordSchema } from '../../../../../packages/shared/src/password-policy';
import api from '../../lib/api';

export function TrialPasswordModal({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState(false);
  const validPassword = passwordSchema.safeParse(password).success;
  const mismatch = confirmation.length > 0 && password !== confirmation;
  const requirements = [
    { label: `${PASSWORD_RULES.minLength} a ${PASSWORD_RULES.maxLength} caracteres`, met: password.length >= PASSWORD_RULES.minLength && password.length <= PASSWORD_RULES.maxLength },
  ];

  async function save() {
    if (saving || !validPassword || password !== confirmation) return;
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

  return <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="trial-password-title">
    <section className="my-auto w-full max-w-md rounded-2xl bg-background p-6 shadow-xl">
      <h2 id="trial-password-title" className="text-xl font-semibold">Crie sua senha</h2>
      <p className="mt-2 text-sm text-text-secondary">Defina uma senha nova para continuar usando sua conta.</p>
      <label className="mt-5 block text-sm font-medium" htmlFor="trial-password">Nova senha</label>
      <input id="trial-password" aria-describedby="trial-password-requirements" className="mt-1 w-full rounded-lg border bg-transparent p-3" type={visible ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
      <button type="button" className="mt-2 text-sm text-brand underline" onClick={() => setVisible(!visible)}>{visible ? 'Ocultar senhas' : 'Mostrar senhas'}</button>
      <div id="trial-password-requirements" className="mt-3 text-sm text-text-secondary">
        <p>Sua senha precisa ter:</p>
        <ul className="mt-1 space-y-1">
          {requirements.map(({ label, met }) => <li key={label} className={met ? 'text-green-700 dark:text-green-400' : ''}><span aria-hidden="true">{met ? '✓' : '○'} </span><span className="sr-only">{met ? 'Atendido: ' : 'Pendente: '}</span>{label}</li>)}
        </ul>
      </div>
      <label className="mt-4 block text-sm font-medium" htmlFor="trial-password-confirm">Confirmar senha</label>
      <input id="trial-password-confirm" aria-invalid={mismatch} aria-describedby={mismatch ? 'trial-password-mismatch' : undefined} className="mt-1 w-full rounded-lg border bg-transparent p-3" type={visible ? 'text' : 'password'} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
      {mismatch && <p id="trial-password-mismatch" className="mt-2 text-sm text-error">As senhas não coincidem.</p>}
      {error && <p className="mt-3 text-sm text-error" role="alert">{error}</p>}
      <button className="mt-5 w-full rounded-lg bg-brand px-4 py-3 text-white disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={saving || !validPassword || password !== confirmation} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar senha'}</button>
    </section>
  </div>;
}
