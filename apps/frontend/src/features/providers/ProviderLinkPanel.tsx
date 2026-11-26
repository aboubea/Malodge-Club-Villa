import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Copy, Link2, MessageCircle, ShieldOff, Smartphone } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { Button } from '../../components/ui/Button';

interface Link {
  url: string;
  whatsappUrl: string | null;
  hasPhone: boolean;
}

/** Personal link to the provider space (missions, answers, payments), sent by WhatsApp. */
export function ProviderLinkPanel({ providerId }: { providerId: string }) {
  const [link, setLink] = useState<Link | null>(null);
  const create = useMutation({
    mutationFn: async () => (await apiClient.post(`/provider-space/links/${providerId}`)).data,
    onSuccess: (r) => setLink((r?.data ?? r) as Link),
  });
  const revoke = useMutation({
    mutationFn: () => apiClient.post(`/provider-space/links/${providerId}/revoke`),
    onSuccess: () => {
      setLink(null);
      toast.success('Les liens envoyés ne fonctionnent plus. Vous pouvez en envoyer un nouveau.');
    },
  });

  return (
    <div className="rounded-xl border border-line p-3.5 space-y-2.5">
      <p className="text-[12.5px] font-semibold text-ink flex items-center gap-1.5">
        <Smartphone size={13} /> Espace prestataire sur téléphone
      </p>
      <p className="text-[12.5px] text-muted">
        Ses missions à accepter ou refuser, à marquer réalisées, et ses règlements — avec un lien personnel, sans mot de passe. Il ne voit que son propre tarif, jamais le prix client.
      </p>
      {!link ? (
        <Button size="sm" variant="secondary" icon={<Link2 size={13} />} loading={create.isPending} onClick={() => create.mutate()}>
          Obtenir son lien
        </Button>
      ) : (
        <div className="space-y-2">
          <p className="text-[12px] font-mono break-all rounded-lg bg-surface-2 px-2.5 py-2 text-ink-soft">{link.url}</p>
          <div className="flex flex-wrap gap-2">
            {link.whatsappUrl ? (
              <a href={link.whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-success text-white text-[12.5px] font-semibold">
                <MessageCircle size={13} /> Envoyer par WhatsApp
              </a>
            ) : (
              <span className="text-[12px] text-warning">Pas de téléphone sur sa fiche : copiez le lien.</span>
            )}
            <Button
              size="sm"
              variant="secondary"
              icon={<Copy size={13} />}
              onClick={() => navigator.clipboard?.writeText(link.url).then(() => toast.success('Lien copié'))}
            >
              Copier
            </Button>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          if (window.confirm('Désactiver tous les liens déjà envoyés à ce prestataire ?')) revoke.mutate();
        }}
        className="inline-flex items-center gap-1 text-[12px] font-semibold text-danger hover:underline"
      >
        <ShieldOff size={12} /> Désactiver les liens envoyés
      </button>
    </div>
  );
}
