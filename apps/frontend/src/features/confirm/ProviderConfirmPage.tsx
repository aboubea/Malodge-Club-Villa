import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { Logo } from '../../components/brand/Logo';

export function ProviderConfirmPage() {
  const [params] = useSearchParams();
  const orderId = params.get('orderId');
  const action = params.get('action') as 'accept' | 'reject' | null;
  const signature = params.get('t') ?? '';

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [result, setResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!orderId || !action) {
      setStatus('error');
      setErrorMsg('Lien invalide. Paramètres manquants.');
      return;
    }
    apiClient
      .get('/orders/provider-confirm', { params: { orderId, action, t: signature } })
      .then((res) => {
        setResult(res.data?.data ?? res.data);
        setStatus('success');
      })
      .catch((err) => {
        setErrorMsg(err?.response?.data?.message || 'Une erreur est survenue.');
        setStatus('error');
      });
  }, [orderId, action, signature]);

  const isAccept = action === 'accept';

  return (
    <div className="min-h-[100dvh] bg-canvas flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="flex justify-center mb-10">
          <Logo size="md" />
        </div>

        <div className="bg-surface border border-line rounded-3xl shadow-card p-8 sm:p-10 space-y-5">
          {status === 'loading' && (
            <>
              <Loader2 size={40} className="text-accent animate-spin mx-auto" />
              <p className="text-sm text-muted">Traitement en cours…</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center ${isAccept ? 'bg-success/10' : 'bg-danger/10'}`}>
                {isAccept ? (
                  <CheckCircle2 size={36} className="text-success" />
                ) : (
                  <XCircle size={36} className="text-danger" />
                )}
              </div>
              <div>
                <h1 className="font-display font-semibold text-[24px] leading-tight text-ink">
                  {isAccept ? 'Disponibilité confirmée' : 'Demande refusée'}
                </h1>
                <p className="text-sm text-muted mt-2">
                  {isAccept
                    ? 'Merci ! Votre disponibilité a été enregistrée. Le gestionnaire sera notifié.'
                    : 'Votre réponse a été enregistrée. Le gestionnaire sera informé.'}
                </p>
              </div>
              <div className="pt-2 border-t border-line">
                <p className="text-xs text-muted">
                  Référence commande : <span className="font-mono text-muted">{result?.id?.slice(0, 8)}…</span>
                </p>
              </div>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center bg-danger/10">
                <XCircle size={36} className="text-danger" />
              </div>
              <div>
                <h1 className="font-display font-semibold text-[24px] leading-tight text-ink">Lien invalide</h1>
                <p className="text-sm text-muted mt-2">{errorMsg}</p>
              </div>
            </>
          )}
        </div>

        <p className="text-xs text-muted">Malodge Club Villa — Conciergerie de luxe</p>
      </div>
    </div>
  );
}
