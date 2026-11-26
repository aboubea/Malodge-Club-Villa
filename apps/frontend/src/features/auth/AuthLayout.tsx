import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Logo } from '../../components/brand/Logo';

/** Original illustration: a Riviera arch framing a sunset over the sea. */
function ArchIllustration() {
  return (
    <svg viewBox="0 0 400 500" className="w-full h-full" aria-hidden>
      <defs>
        <linearGradient id="auth-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F6E2B8" />
          <stop offset="0.42" stopColor="#EBB57E" />
          <stop offset="0.66" stopColor="#C97A5A" />
        </linearGradient>
        <linearGradient id="auth-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#456571" />
          <stop offset="1" stopColor="#15232A" />
        </linearGradient>
        <radialGradient id="auth-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFF4DC" />
          <stop offset="0.7" stopColor="#FBE1AE" />
          <stop offset="1" stopColor="#F2C98C" stopOpacity="0" />
        </radialGradient>
        <clipPath id="auth-arch">
          <path d="M48 500 V196 A152 152 0 0 1 352 196 V500 Z" />
        </clipPath>
      </defs>

      <g clipPath="url(#auth-arch)">
        <rect width="400" height="330" fill="url(#auth-sky)" />
        <circle cx="200" cy="318" r="86" fill="url(#auth-sun)" />
        <circle cx="200" cy="318" r="46" fill="#FFF1D6" />
        <rect y="318" width="400" height="182" fill="url(#auth-sea)" />
        {/* Sun glitter on the water */}
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <rect
            key={i}
            x={200 - (40 - i * 4.5)}
            y={330 + i * 13}
            width={(40 - i * 4.5) * 2}
            height="2.2"
            rx="1.1"
            fill="#FBE1AE"
            opacity={0.75 - i * 0.09}
          />
        ))}
        {/* Distant headland */}
        <path d="M48 318 C 90 300, 120 296, 150 306 C 165 311, 172 318, 180 318 Z" fill="#7C4A3A" opacity="0.55" />
        {/* Cypress silhouettes */}
        <path d="M92 500 C 70 420, 78 330, 96 268 C 112 330, 122 420, 100 500 Z" fill="#171826" />
        <path d="M126 500 C 112 440, 116 380, 128 336 C 140 380, 146 440, 134 500 Z" fill="#1C1D2C" />
        <path d="M318 500 C 300 430, 304 360, 316 312 C 330 360, 338 430, 326 500 Z" fill="#171826" />
        {/* Terrace balustrade */}
        <rect x="0" y="452" width="400" height="6" fill="#E9DCC6" opacity="0.9" />
        {Array.from({ length: 16 }).map((_, i) => (
          <rect key={i} x={52 + i * 19} y="458" width="7" height="42" rx="3.5" fill="#E9DCC6" opacity="0.85" />
        ))}
      </g>

      <path
        d="M48 500 V196 A152 152 0 0 1 352 196 V500"
        fill="none"
        stroke="#E9A686"
        strokeOpacity="0.55"
        strokeWidth="1.2"
      />
      <path
        d="M30 500 V196 A170 170 0 0 1 370 196 V500"
        fill="none"
        stroke="#E9A686"
        strokeOpacity="0.22"
        strokeWidth="1"
      />
    </svg>
  );
}

function Showcase() {
  return (
    <div className="hidden lg:block p-3 h-[100dvh] sticky top-0">
      <div className="relative h-full rounded-[28px] overflow-hidden bg-[#1F2130] text-[#F3F3F7] flex flex-col">
        <div aria-hidden className="absolute -top-40 left-1/2 -translate-x-1/2 w-[620px] h-[620px] rounded-full bg-[#E9A686]/[0.16] blur-3xl" />
        <div aria-hidden className="absolute inset-0 opacity-[0.035] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:18px_18px]" />

        <div className="relative flex-1 min-h-0 flex items-end justify-center px-12 pt-14">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="h-full max-h-[440px] aspect-[4/5]"
          >
            <ArchIllustration />
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.25 }}
          className="relative px-12 pb-12 pt-10"
        >
          <p className="text-[12.5px] font-semibold text-[#F2B69A]">
            Conciergerie privée
          </p>
          <h2 className="font-display font-semibold text-[30px] leading-[1.02] mt-4 text-white max-w-md">
            L'art de recevoir, <span className="text-[#F2B69A] whitespace-nowrap">sur-mesure</span>.
          </h2>
          <div className="mt-8 grid grid-cols-3 gap-6 border-t border-white/10 pt-6 text-[13px]">
            {[
              ['Villas', "d'exception"],
              ['Services', 'à la demande'],
              ['Pilotage', 'en temps réel'],
            ].map(([a, b]) => (
              <div key={a}>
                <p className="text-white font-semibold">{a}</p>
                <p className="text-white/55 mt-0.5">{b}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

interface AuthLayoutProps {
  children: ReactNode;
  /** Optional footer note under the form (e.g. "Pas encore de compte ?"). */
  aside?: ReactNode;
}

export function AuthLayout({ children, aside }: AuthLayoutProps) {
  return (
    <div className="min-h-[100dvh] grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] bg-canvas">
      <div className="flex flex-col min-h-[100dvh] px-6 sm:px-12 py-8">
        <Link to="/login" className="self-start">
          <Logo size="md" />
        </Link>

        <div className="flex-1 flex items-center justify-center py-12">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[400px]"
          >
            {children}
            {aside && <div className="mt-8 text-center text-[13.5px] text-muted">{aside}</div>}
          </motion.div>
        </div>

        <p className="text-[12px] text-muted">
          © {new Date().getFullYear()} Malodge Club Villa · Conciergerie de luxe
        </p>
      </div>

      <Showcase />
    </div>
  );
}

/** Serif page title + subtitle used across auth screens. */
export function AuthHeading({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-9">
      <h1 className="font-display font-semibold text-[30px] leading-[1.02] tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="text-[14.5px] text-muted mt-3 leading-relaxed">{subtitle}</p>}
    </div>
  );
}
