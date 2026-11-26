import { cn } from '../../lib/utils';

interface LogoMarkProps {
  size?: number;
  className?: string;
}

/**
 * MALODGE CLUB symbol: a riad doorway (terracotta arch) framing a sun setting
 * over the pool. The arch follows the accent color, the sun and water the
 * current text color, so both themes work.
 */
export function LogoMark({ size = 28, className }: LogoMarkProps) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={cn('shrink-0 text-ink', className)} aria-hidden>
      <path
        style={{ fill: 'rgb(var(--c-accent))' }}
        fillRule="evenodd"
        d="M4.5 30V14.5C4.5 8 9.6 3.4 16 1.6 22.4 3.4 27.5 8 27.5 14.5V30ZM9.6 30V17.4c0-3.8 2.7-6.6 6.4-7.9 3.7 1.3 6.4 4.1 6.4 7.9V30Z"
      />
      <path fill="currentColor" d="M12 22.6a4 4 0 0 1 8 0Z" />
      <rect x="9.6" y="24.3" width="12.8" height="1.7" fill="currentColor" />
      <rect x="12" y="27.4" width="8" height="1.7" rx=".85" fill="currentColor" />
    </svg>
  );
}

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Force light text (for use on dark panels). */
  inverted?: boolean;
}

const SIZES = {
  sm: { mark: 31, name: 'text-[16.5px]', club: 'text-[8.8px] mt-[5px]', gap: 'gap-[11px]' },
  md: { mark: 36, name: 'text-[19px]', club: 'text-[10px] mt-1.5', gap: 'gap-3' },
  lg: { mark: 46, name: 'text-[25px]', club: 'text-[13px] mt-2', gap: 'gap-4' },
};

/** MALODGE CLUB logo: symbol + name in spaced capitals, CLUB underneath in terracotta. */
export function Logo({ size = 'sm', className, inverted }: LogoProps) {
  const s = SIZES[size];
  return (
    <span className={cn('inline-flex items-center', s.gap, className)} role="img" aria-label="Malodge Club">
      <LogoMark size={s.mark} className={inverted ? 'text-white' : undefined} />
      <span className="inline-flex flex-col leading-none" aria-hidden>
        <span className={cn('font-extrabold tracking-[0.14em]', s.name, inverted ? 'text-white' : 'text-ink')}>MALODGE</span>
        <span className={cn('font-bold tracking-[0.52em] text-accent', s.club)}>CLUB</span>
      </span>
    </span>
  );
}
