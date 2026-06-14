import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Crown, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { apiClient } from '../../lib/apiClient';

function useResetPassword() {
  return useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) =>
      apiClient.post('/auth/reset-password', { token, password }).then((r) => r.data),
  });
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});

  const mutation = useResetPassword();

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0A0B] p-6">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-full bg-red-900/20 flex items-center justify-center mx-auto mb-5">
            <AlertCircle size={28} className="text-red-400" />
          </div>
          <h2 className="text-xl font-light text-[#F5F0EB] mb-3">Lien invalide</h2>
          <p className="text-sm text-[#6B6B6F] mb-6">
            Ce lien de réinitialisation est invalide ou a expiré.
          </p>
          <Link to="/mot-de-passe-oublie" className="text-sm text-[#C9A96E] hover:text-[#E8C98A] transition-colors">
            Demander un nouveau lien
          </Link>
        </div>
      </div>
    );
  }

  const validate = () => {
    const newErrors: typeof errors = {};
    if (!password) {
      newErrors.password = 'Mot de passe requis';
    } else if (password.length < 8) {
      newErrors.password = 'Minimum 8 caractères';
    }
    if (!confirm) {
      newErrors.confirm = 'Confirmation requise';
    } else if (password !== confirm) {
      newErrors.confirm = 'Les mots de passe ne correspondent pas';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    mutation.mutate(
      { token, password },
      {
        onSuccess: () => {
          toast.success('Mot de passe réinitialisé avec succès');
          setTimeout(() => navigate('/login'), 1500);
        },
        onError: (err: unknown) => {
          const msg =
            (err as { response?: { data?: { message?: string } } })
              ?.response?.data?.message ?? 'Lien invalide ou expiré.';
          toast.error(msg);
        },
      },
    );
  };

  if (mutation.isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0A0B] p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-sm"
        >
          <div className="w-14 h-14 rounded-full bg-[#2D7A4F]/15 flex items-center justify-center mx-auto mb-5">
            <CheckCircle size={28} className="text-[#2D7A4F]" />
          </div>
          <h2 className="text-xl font-light text-[#F5F0EB] mb-3">
            Mot de passe réinitialisé
          </h2>
          <p className="text-sm text-[#6B6B6F] mb-6">
            Redirection vers la page de connexion…
          </p>
        </motion.div>
      </div>
    );
  }

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
          <p className="text-sm font-medium text-[#F5F0EB]">Mahodge Club Villa</p>
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-light text-[#F5F0EB] tracking-tight">
            Nouveau mot de passe
          </h2>
          <p className="text-sm text-[#6B6B6F] mt-1.5">
            Choisissez un mot de passe sécurisé d'au moins 8 caractères.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nouveau mot de passe"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
            }}
            error={errors.password}
            autoFocus
            rightIcon={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="hover:text-[#F5F0EB] transition-colors"
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            }
          />

          <Input
            label="Confirmer le mot de passe"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              if (errors.confirm) setErrors((p) => ({ ...p, confirm: undefined }));
            }}
            error={errors.confirm}
          />

          {/* Password strength hints */}
          <div className="flex gap-3">
            {[
              { label: '8 car.', ok: password.length >= 8 },
              { label: 'Majuscule', ok: /[A-Z]/.test(password) },
              { label: 'Chiffre', ok: /\d/.test(password) },
            ].map(({ label, ok }) => (
              <div key={label} className="flex items-center gap-1">
                <div
                  className={`w-1.5 h-1.5 rounded-full transition-colors duration-150 ${
                    ok ? 'bg-[#2D7A4F]' : 'bg-[#242428]'
                  }`}
                />
                <span className={`text-xs transition-colors duration-150 ${ok ? 'text-[#F5F0EB]' : 'text-[#6B6B6F]'}`}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={mutation.isPending}
            className="w-full mt-2"
          >
            Réinitialiser le mot de passe
          </Button>
        </form>

        <div className="mt-6 text-center">
          <Link
            to="/login"
            className="text-sm text-[#6B6B6F] hover:text-[#F5F0EB] transition-colors"
          >
            Annuler et retourner à la connexion
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
