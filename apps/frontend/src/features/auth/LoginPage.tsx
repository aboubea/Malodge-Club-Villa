import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Crown, Sparkles } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useLogin } from './useAuth';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

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
    <div className="min-h-screen flex bg-[#0A0A0B]">
      {/* Left panel — gold gradient + branding */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #0D0B08 0%, #1A1408 30%, #2A1F0A 60%, #1A1408 100%)',
        }}
      >
        {/* Decorative gold circles */}
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-5"
          style={{ background: 'radial-gradient(circle, #C9A96E 0%, transparent 70%)', transform: 'translate(30%, -30%)' }}
        />
        <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full opacity-5"
          style={{ background: 'radial-gradient(circle, #C9A96E 0%, transparent 70%)', transform: 'translate(-30%, 30%)' }}
        />

        {/* Gold border left */}
        <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-[#C9A96E]/30 to-transparent" />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#C9A96E] flex items-center justify-center">
            <Crown size={20} className="text-[#0A0A0B]" />
          </div>
          <div>
            <p className="text-lg font-medium text-[#F5F0EB]">Mahodge</p>
            <p className="text-xs text-[#C9A96E]">Club Villa</p>
          </div>
        </div>

        {/* Main content */}
        <div className="relative z-10 space-y-8">
          <div className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              <h1 className="text-4xl font-light text-[#F5F0EB] leading-tight tracking-tight">
                Excellence en<br />
                <span className="text-[#C9A96E]">Conciergerie</span><br />
                de Luxe
              </h1>
            </motion.div>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="text-[#6B6B6F] text-sm leading-relaxed max-w-sm"
            >
              Gérez vos villas d'exception, orchestrez des séjours mémorables
              et offrez à vos clients une expérience hors du commun.
            </motion.p>
          </div>

          {/* Feature badges */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="flex flex-wrap gap-2"
          >
            {['Villas d\'exception', 'Services premium', 'Gestion centralisée', 'Analyses en temps réel'].map((f) => (
              <span
                key={f}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-[#C9A96E] border border-[#C9A96E]/20 bg-[#C9A96E]/5"
              >
                <Sparkles size={10} />
                {f}
              </span>
            ))}
          </motion.div>
        </div>

        {/* Footer */}
        <div className="relative z-10">
          <p className="text-xs text-[#6B6B6F]">
            © 2024 Mahodge Club Villa. Tous droits réservés.
          </p>
        </div>
      </motion.div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full max-w-sm"
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-[#C9A96E] flex items-center justify-center">
              <Crown size={16} className="text-[#0A0A0B]" />
            </div>
            <div>
              <p className="text-base font-medium text-[#F5F0EB]">Mahodge Club Villa</p>
            </div>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h2 className="text-2xl font-light text-[#F5F0EB] tracking-tight">
              Connexion
            </h2>
            <p className="text-sm text-[#6B6B6F] mt-1">
              Accédez à votre espace de gestion
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Adresse email"
              type="email"
              placeholder="admin@mahodge.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
              }}
              error={errors.email}
              autoComplete="email"
              autoFocus
            />

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
                  className="hover:text-[#F5F0EB] transition-colors"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              }
            />

            <div className="flex items-center justify-end">
              <Link
                to="/mot-de-passe-oublie"
                className="text-xs text-[#6B6B6F] hover:text-[#C9A96E] transition-colors"
              >
                Mot de passe oublié ?
              </Link>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={login.isPending}
              className="w-full mt-2"
            >
              Se connecter
            </Button>
          </form>

          {/* Demo hint */}
          <div className="mt-6 p-3 rounded-lg border border-[#242428] bg-[#111113]">
            <p className="text-xs text-[#6B6B6F] text-center">
              Demo: <span className="text-[#C9A96E]">superadmin@mahodge.com</span>
              {' / '}
              <span className="text-[#C9A96E]">SuperAdmin2024!</span>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
