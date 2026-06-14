import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Crown, Eye, EyeOff } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { apiClient } from '../../lib/apiClient';
import { useAuthStore } from '../../store/authStore';
import { LoginResponseDto } from '@malodge/shared';

function useRegister() {
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (data: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      phone?: string;
    }) =>
      apiClient
        .post<{ data: LoginResponseDto }>('/auth/register', data)
        .then((r) => r.data.data ?? (r.data as any)),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken, data.refreshToken);
      toast.success('Compte créé avec succès !');
      navigate('/');
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { status?: number; data?: { message?: string } } };
      if (!axiosError.response) {
        toast.error('Impossible de contacter le serveur.');
      } else if (axiosError.response.status === 409) {
        toast.error('Un compte existe déjà avec cet email.');
      } else {
        toast.error(axiosError.response.data?.message ?? 'Erreur lors de la création du compte.');
      }
    },
  });
}

export function RegisterPage() {
  const { isAuthenticated } = useAuthStore();
  const mutation = useRegister();

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirm: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Partial<typeof form>>({});

  if (isAuthenticated) return <Navigate to="/" replace />;

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((p) => ({ ...p, [field]: e.target.value }));
    if (errors[field]) setErrors((p) => ({ ...p, [field]: undefined }));
  };

  const validate = () => {
    const e: Partial<typeof form> = {};
    if (!form.firstName.trim()) e.firstName = 'Prénom requis';
    if (!form.lastName.trim()) e.lastName = 'Nom requis';
    if (!form.email) e.email = 'Email requis';
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Email invalide';
    if (!form.password) e.password = 'Mot de passe requis';
    else if (form.password.length < 8) e.password = 'Minimum 8 caractères';
    if (!form.confirm) e.confirm = 'Confirmation requise';
    else if (form.password !== form.confirm) e.confirm = 'Les mots de passe ne correspondent pas';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    mutation.mutate({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      password: form.password,
      phone: form.phone.trim() || undefined,
    });
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
          <p className="text-sm font-medium text-[#F5F0EB]">Malodge Club Villa</p>
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-light text-[#F5F0EB] tracking-tight">Créer un compte</h2>
          <p className="text-sm text-[#6B6B6F] mt-1.5">Rejoignez Malodge Club Villa</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Prénom"
              placeholder="Jean"
              value={form.firstName}
              onChange={set('firstName')}
              error={errors.firstName}
              autoFocus
            />
            <Input
              label="Nom"
              placeholder="Dupont"
              value={form.lastName}
              onChange={set('lastName')}
              error={errors.lastName}
            />
          </div>

          <Input
            label="Adresse email"
            type="email"
            placeholder="jean@email.com"
            value={form.email}
            onChange={set('email')}
            error={errors.email}
            autoComplete="email"
          />

          <Input
            label="Téléphone (optionnel)"
            type="tel"
            placeholder="+33 6 12 34 56 78"
            value={form.phone}
            onChange={set('phone')}
          />

          <Input
            label="Mot de passe"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={form.password}
            onChange={set('password')}
            error={errors.password}
            autoComplete="new-password"
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
            value={form.confirm}
            onChange={set('confirm')}
            error={errors.confirm}
            autoComplete="new-password"
          />

          {/* Password strength */}
          <div className="flex gap-3">
            {[
              { label: '8 car.', ok: form.password.length >= 8 },
              { label: 'Majuscule', ok: /[A-Z]/.test(form.password) },
              { label: 'Chiffre', ok: /\d/.test(form.password) },
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
            Créer mon compte
          </Button>
        </form>

        <div className="mt-6 text-center">
          <span className="text-sm text-[#6B6B6F]">Déjà un compte ?{' '}</span>
          <Link to="/login" className="text-sm text-[#C9A96E] hover:text-[#E8C98A] transition-colors">
            Se connecter
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
