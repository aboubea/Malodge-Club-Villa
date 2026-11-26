import { cn } from '../../lib/utils';

interface LogoMarkProps {
  size?: number;
  className?: string;
}

/** Villa glyph: a house silhouette with an arched doorway. Uses the current text color. */
export function LogoMark({ size = 28, className }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn('shrink-0 text-ink', className)}
      aria-hidden
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M2.5 21.5V10.2a1.2 1.2 0 0 1 .46-.94l8.3-6.5a1.2 1.2 0 0 1 1.48 0l8.3 6.5c.29.23.46.57.46.94v11.3ZM9.4 21.5v-5.1a2.6 2.6 0 0 1 5.2 0v5.1Z"
      />
      <path fill="currentColor" d="M17.2 4.2h2.1v3.6l-2.1-1.65Z" />
    </svg>
  );
}

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Force light text (for use on dark panels). */
  inverted?: boolean;
  /** Show the "Club Villa" tagline next to the wordmark. */
  tagline?: boolean;
}

const SIZES = {
  sm: { mark: 26, word: 'text-[19px]' },
  md: { mark: 30, word: 'text-[22px]' },
  lg: { mark: 36, word: 'text-[26px]' },
};

export function Logo({ size = 'sm', className, inverted, tagline }: LogoProps) {
  const s = SIZES[size];
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={s.mark} className={inverted ? 'text-white' : undefined} />
      <span className={cn('font-extrabold leading-none tracking-tight', s.word, inverted ? 'text-white' : 'text-ink')}>
        Malodge
      </span>
      {tagline && (
        <span
          className={cn(
            'text-[11px] font-medium leading-none mt-1',
            inverted ? 'text-white/60' : 'text-muted',
          )}
        >
          Club Villa
        </span>
      )}
    </span>
  );
}
