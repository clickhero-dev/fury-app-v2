import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components';

/**
 * Card de verificação do número WhatsApp (issue #207).
 *
 * Estados: sem número → dica; verified → badge; caso contrário → botão
 * "Verificar número" (POST /wpp/verify/start → código chega no WhatsApp)
 * + confirmação por digitação (POST /wpp/verify/confirm). A resposta do
 * usuário no WhatsApp confirma automaticamente via webhook; o botão
 * "Já respondi" reconsulta o status.
 */

interface VerificationStatus {
  id: string;
  phone: string;
  status: string;
  verifiedAt: string | null;
  expiresAt: string;
}

interface StartResult {
  id: string;
  phone: string;
  expiresAt: string;
}

function errMsg(e: unknown): string {
  const anyErr = e as { response?: { data?: { error?: { message?: string } } } };
  return anyErr?.response?.data?.error?.message ?? 'Erro ao verificar o número. Tente novamente.';
}

export function WhatsappVerificationCard({ whatsappNumber }: { whatsappNumber: string | null }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<'idle' | 'awaiting_code'>('idle');
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const { data: status } = useQuery({
    queryKey: ['wpp-verification-status'],
    queryFn: async (): Promise<VerificationStatus | null> => {
      try {
        const res = await api.get<{ data: VerificationStatus | null }>('/wpp/verify/status');
        return res.data.data;
      } catch {
        return null;
      }
    },
  });

  useEffect(() => {
    setStep('idle');
    setVerificationId(null);
    setCode('');
    setError(null);
  }, [whatsappNumber]);

  if (!whatsappNumber) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Verificação do WhatsApp</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-text-secondary">
            Cadastre um número na seção acima e salve para poder verificá-lo.
          </p>
        </CardContent>
      </Card>
    );
  }

  const verified = status?.status === 'verified';

  async function handleStart() {
    setError(null);
    setSending(true);
    try {
      const res = await api.post<{ data: StartResult }>('/wpp/verify/start', {
        phone: whatsappNumber,
      });
      setVerificationId(res.data.data.id);
      setStep('awaiting_code');
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSending(false);
    }
  }

  async function handleConfirm() {
    if (!verificationId) return;
    setError(null);
    setSending(true);
    try {
      await api.post('/wpp/verify/confirm', { verificationId, code: code.replace(/\D/g, '') });
      await queryClient.invalidateQueries({ queryKey: ['wpp-verification-status'] });
      setStep('idle');
      setVerificationId(null);
      setCode('');
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSending(false);
    }
  }

  async function handleRecheck() {
    await queryClient.invalidateQueries({ queryKey: ['wpp-verification-status'] });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verificação do WhatsApp</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {verified ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 px-3 py-1 text-xs font-semibold">
              ✓ Verificado
            </span>
            <span className="text-sm text-text-secondary">({status?.phone})</span>
          </div>
        ) : step === 'awaiting_code' ? (
          <>
            <p className="text-sm text-text-secondary">
              Enviamos um código de 6 dígitos para o número cadastrado. Responda a mensagem
              no WhatsApp com o código — ou digite abaixo para confirmar.
            </p>
            <input
              type="text"
              inputMode="numeric"
              placeholder="000000"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="w-36 rounded-lg border border-border bg-background text-foreground px-3 py-2 text-sm tracking-widest outline-none focus:outline-none focus:ring-2 focus:ring-admin-petrol/30 focus:border-admin-petrol"
            />
            <div className="flex gap-2">
              <Button onClick={handleConfirm} disabled={sending || code.length !== 6}>
                {sending ? 'Confirmando...' : 'Confirmar'}
              </Button>
              <Button variant="outline" onClick={handleRecheck} disabled={sending}>
                Já respondi no WhatsApp
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-text-secondary">
              Confirme que este número é seu: enviamos um código pelo WhatsApp e você
              responde — ou digita o código aqui.
            </p>
            <Button onClick={handleStart} disabled={sending}>
              {sending ? 'Enviando...' : 'Verificar número'}
            </Button>
          </>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
      </CardContent>
    </Card>
  );
}
