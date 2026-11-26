import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Sparkles } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useLogin } from './useAuth';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { AuthLayout, AuthHeading } from './AuthLayout';

export function LoginPage() {
  const { isAuthenticated } = useAuthStore();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  if (isAuthenticated) return <Navigate to="/" replace />;

  const validate = () => {
    const newErrors: typeof errors = {};
    if (!email) newErrors.email = 'Email requis';
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Email invalide';
    if (!password) newErrors.password = 'Mot de passe requis';
    else if (password.length < 6) newErrors.password = 'Minimum 6 caractères';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    login.mutate({ email, password });
  };

  return (
    <AuthLayout
      aside={
        <>
          Pas encore de compte ?{' '}
          <Link to="/inscription" className="font-medium text-accent hover:text-accent-hover transition-colors">
            Créer un compte
          </Link>
        </>
      }
    >
      <AuthHeading title="Bon retour parmi nous" subtitle="Connectez-vous à votre espace Malodge pour gérer vos villas et vos séjours." />

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <Input
          label="Adresse email"
          type="email"
          placeholder="vous@exemple.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
          }}
          error={errors.email}
          autoComplete="email"
          autoFocus
        />

        <div className="space-y-2">
          <Input
            label="Mot de passe"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
            }}
            error={errors.password}
            autoComplete="current-password"
            rightIcon={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="flex items-center hover:text-ink transition-colors"
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
          />
          <div className="flex justify-end">
            <Link
              to="/mot-de-passe-oublie"
              className="text-[12.5px] text-muted hover:text-accent transition-colors"
            >
              Mot de passe oublié ?
            </Link>
          </div>
        </div>

        <Button type="submit" variant="primary" size="lg" loading={login.isPending} className="w-full">
          Se connecter
        </Button>
      </form>

      {/* Demo hint */}
      <div className="mt-6 flex items-start gap-3 p-3.5 rounded-xl border border-dashed border-line-strong bg-surface/60">
        <Sparkles size={15} className="text-accent mt-0.5 shrink-0" />
        <p className="text-[12.5px] text-muted leading-relaxed">
          Démo : <span className="text-ink-soft font-medium">superadmin@malodge.com</span>
          {' · '}
          <span className="text-ink-soft font-medium">SuperAdmin2024!</span>
        </p>
      </div>
    </AuthLayout>
  );
}
