import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { KeyRound } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

/** The signed-in user changes their own password (current password required). */
export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
  };
  const close = () => {
    reset();
    onClose();
  };

  const change = useMutation({
    mutationFn: () => apiClient.post('/auth/change-password', { currentPassword: current, newPassword: next }),
    onSuccess: () => {
      toast.success('Mot de passe modifié');
      qc.invalidateQueries({ queryKey: ['monitoring'] });
      close();
    },
    // Errors (wrong current password, too short…) are shown by the API client.
  });

  const tooShort = next.length > 0 && next.length < 10;
  const mismatch = confirm.length > 0 && confirm !== next;
  const ready = current && next.length >= 10 && confirm === next;

  return (
    <Modal open={open} onClose={close} title="Changer mon mot de passe" description="Au moins 10 caractères. Évitez un mot de passe déjà utilisé ailleurs." size="md">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) change.mutate();
        }}
      >
        <Input label="Mot de passe actuel" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <Input
          label="Nouveau mot de passe"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          error={tooShort ? 'Au moins 10 caractères' : undefined}
        />
        <Input
          label="Confirmer le nouveau mot de passe"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={mismatch ? 'Les deux mots de passe sont différents' : undefined}
        />
        <Button type="submit" icon={<KeyRound size={14} />} loading={change.isPending} disabled={!ready} className="w-full">
          Enregistrer le nouveau mot de passe
        </Button>
      </form>
    </Modal>
  );
}
