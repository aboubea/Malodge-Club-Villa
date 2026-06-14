import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Crown, ArrowLeft, Mail, CheckCircle } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import apiClient from '../../lib/apiClient';

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
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0B] p-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-10">
          <div className="w-8 h-8 rounded-lg bg-[#C9A96E] flex items-center justify-center">
            <Crown size={16} className="text-[#0A0A0B]" />
          </div>
          <div>
            <p className="text-sm font-medium text-[#F5F0EB]">Mahodge Club Villa</p>
          </div>
        </div>

        {mutation.isSuccess ? (
          /* ── Success state ── */
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25 }}
            className="text-center"
          >
            <div className="w-14 h-14 rounded-full bg-[#2D7A4F]/15 flex items-center justify-center mx-auto mb-5">
              <CheckCircle size={28} className="text-[#2D7A4F]" />
            </div>
            <h2 className="text-xl font-light text-[#F5F0EB] mb-3">Email envoyé</h2>
            <p className="text-sm text-[#6B6B6F] leading-relaxed mb-6">
              Si un compte existe pour{' '}
              <span className="text-[#C9A96E]">{email}</span>, vous recevrez
              un lien de réinitialisation dans les prochaines minutes.
            </p>
            <p className="text-xs text-[#6B6B6F] mb-8">
              Vérifiez également votre dossier spam.
            </p>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-sm text-[#C9A96E] hover:text-[#E8C98A] transition-colors"
            >
              <ArrowLeft size={14} />
              Retour à la connexion
            </Link>
          </motion.div>
        ) : (
          /* ── Form ── */
          <>
            <div className="mb-8">
              <h2 className="text-2xl font-light text-[#F5F0EB] tracking-tight">
                Mot de passe oublié ?
              </h2>
              <p className="text-sm text-[#6B6B6F] mt-1.5 leading-relaxed">
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
                className="inline-flex items-center gap-1.5 text-sm text-[#6B6B6F] hover:text-[#F5F0EB] transition-colors"
              >
                <ArrowLeft size={13} />
                Retour à la connexion
              </Link>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
