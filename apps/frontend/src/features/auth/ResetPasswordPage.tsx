import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { AuthLayout } from './AuthLayout';
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
      <AuthLayout>
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-danger/10 flex items-center justify-center mx-auto mb-5">
            <AlertCircle size={28} className="text-danger" />
          </div>
          <h2 className="font-display font-semibold text-[24px] leading-tight text-ink mb-3">Lien invalide</h2>
          <p className="text-sm text-muted mb-6">
            Ce lien de réinitialisation est invalide ou a expiré.
          </p>
          <Link to="/mot-de-passe-oublie" className="text-sm text-accent hover:text-accent-hover transition-colors">
            Demander un nouveau lien
          </Link>
        </div>
      </AuthLayout>
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
      <AuthLayout>
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-5">
            <CheckCircle size={28} className="text-success" />
          </div>
          <h2 className="font-display font-semibold text-[24px] leading-tight text-ink mb-3">
            Mot de passe réinitialisé
          </h2>
          <p className="text-sm text-muted mb-6">
            Redirection vers la page de connexion…
          </p>
        </motion.div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>

        <div className="mb-9">
          <h1 className="font-display font-semibold text-[30px] leading-[1.02] tracking-tight text-ink">
            {searchParams.get('invitation') ? 'Choisissez votre mot de passe' : 'Nouveau mot de passe'}
          </h1>
          <p className="text-[14.5px] text-muted mt-3">
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
                className="hover:text-ink transition-colors"
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
                    ok ? 'bg-success' : 'bg-line'
                  }`}
                />
                <span className={`text-xs transition-colors duration-150 ${ok ? 'text-ink' : 'text-muted'}`}>
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
            className="text-sm text-muted hover:text-ink transition-colors"
          >
            Annuler et retourner à la connexion
          </Link>
        </div>
    </AuthLayout>
  );
}
