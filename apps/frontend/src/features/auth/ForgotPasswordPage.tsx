import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Mail, CheckCircle } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { AuthLayout } from './AuthLayout';
import { apiClient } from '../../lib/apiClient';

function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) =>
      apiClient.post('/auth/forgot-password', { email }).then((r) => r.data),
  });
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const mutation = useForgotPassword();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setError('Email requis'); return; }
    if (!/\S+@\S+\.\S+/.test(email)) { setError('Email invalide'); return; }
    setError('');
    mutation.mutate(email);
  };

  return (
    <AuthLayout>

        {mutation.isSuccess ? (
          /* ── Success state ── */
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25 }}
            className="text-center"
          >
            <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-5">
              <CheckCircle size={28} className="text-success" />
            </div>
            <h2 className="font-display font-semibold text-[24px] leading-tight text-ink mb-3">Email envoyé</h2>
            <p className="text-sm text-muted leading-relaxed mb-6">
              Si un compte existe pour{' '}
              <span className="text-accent">{email}</span>, vous recevrez
              un lien de réinitialisation dans les prochaines minutes.
            </p>
            <p className="text-xs text-muted mb-8">
              Vérifiez également votre dossier spam.
            </p>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-sm text-accent hover:text-accent-hover transition-colors"
            >
              <ArrowLeft size={14} />
              Retour à la connexion
            </Link>
          </motion.div>
        ) : (
          /* ── Form ── */
          <>
            <div className="mb-9">
              <h1 className="font-display font-semibold text-[30px] leading-[1.02] tracking-tight text-ink">
                Mot de passe oublié ?
              </h1>
              <p className="text-[14.5px] text-muted mt-3 leading-relaxed">
                Entrez votre adresse email et nous vous enverrons un lien pour
                réinitialiser votre mot de passe.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Adresse email"
                type="email"
                placeholder="votre@email.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError('');
                }}
                error={error}
                autoFocus
                leftIcon={<Mail size={14} />}
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={mutation.isPending}
                className="w-full mt-2"
              >
                Envoyer le lien
              </Button>
            </form>

            <div className="mt-6 text-center">
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors"
              >
                <ArrowLeft size={13} />
                Retour à la connexion
              </Link>
            </div>
          </>
        )}
    </AuthLayout>
  );
}
