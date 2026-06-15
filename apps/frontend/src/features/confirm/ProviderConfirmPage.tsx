import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2, Crown } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';

export function ProviderConfirmPage() {
  const [params] = useSearchParams();
  const orderId = params.get('orderId');
  const action = params.get('action') as 'accept' | 'reject' | null;

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
      .get(`/orders/provider-confirm?orderId=${orderId}&action=${action}`)
      .then((res) => {
        setResult(res.data?.data ?? res.data);
        setStatus('success');
      })
      .catch((err) => {
        setErrorMsg(err?.response?.data?.message || 'Une erreur est survenue.');
        setStatus('error');
      });
  }, [orderId, action]);

  const isAccept = action === 'accept';

  return (
    <div className="min-h-screen bg-[#0A0A0B] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-xl bg-[#C9A96E] flex items-center justify-center">
            <Crown size={18} className="text-[#0A0A0B]" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-[#F5F0EB]">Malodge</p>
            <p className="text-xs text-[#6B6B6F]">Club Villa</p>
          </div>
        </div>

        <div className="bg-[#111113] border border-[#242428] rounded-2xl p-8 space-y-5">
          {status === 'loading' && (
            <>
              <Loader2 size={40} className="text-[#C9A96E] animate-spin mx-auto" />
              <p className="text-sm text-[#6B6B6F]">Traitement en cours…</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center ${isAccept ? 'bg-green-900/30' : 'bg-red-900/30'}`}>
                {isAccept ? (
                  <CheckCircle2 size={36} className="text-green-400" />
                ) : (
                  <XCircle size={36} className="text-red-400" />
                )}
              </div>
              <div>
                <h1 className="text-xl font-medium text-[#F5F0EB]">
                  {isAccept ? 'Disponibilité confirmée' : 'Demande refusée'}
                </h1>
                <p className="text-sm text-[#6B6B6F] mt-2">
                  {isAccept
                    ? 'Merci ! Votre disponibilité a été enregistrée. Le gestionnaire sera notifié.'
                    : 'Votre réponse a été enregistrée. Le gestionnaire sera informé.'}
                </p>
              </div>
              <div className="pt-2 border-t border-[#242428]">
                <p className="text-xs text-[#3A3A3E]">
                  Référence commande : <span className="font-mono text-[#6B6B6F]">{result?.id?.slice(0, 8)}…</span>
                </p>
              </div>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center bg-red-900/20">
                <XCircle size={36} className="text-red-400" />
              </div>
              <div>
                <h1 className="text-xl font-medium text-[#F5F0EB]">Lien invalide</h1>
                <p className="text-sm text-[#6B6B6F] mt-2">{errorMsg}</p>
              </div>
            </>
          )}
        </div>

        <p className="text-xs text-[#3A3A3E]">Malodge Club Villa — Conciergerie de luxe</p>
      </div>
    </div>
  );
}
