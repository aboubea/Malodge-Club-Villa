import { cn } from '../../lib/utils';

interface LogoMarkProps {
  size?: number;
  className?: string;
}

/** Monogram mark: serif "M" on a champagne tile. Same in both themes. */
export function LogoMark({ size = 32, className }: LogoMarkProps) {
  return (
    <span
      className={cn(
        'gold-gradient relative inline-flex items-center justify-center shrink-0 rounded-[10px]',
        'shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_1px_2px_rgb(60_40_10/0.25)]',
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span
        className="font-display leading-none text-[#1D1B18]"
        style={{ fontSize: size * 0.68, marginTop: size * 0.04 }}
      >
        M
      </span>
    </span>
  );
}

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Force light text (for use on dark photography). */
  inverted?: boolean;
}

const SIZES = {
  sm: { mark: 30, word: 'text-[21px]', sub: 'text-[9px]' },
  md: { mark: 36, word: 'text-[24px]', sub: 'text-[9.5px]' },
  lg: { mark: 44, word: 'text-[30px]', sub: 'text-[10.5px]' },
};

export function Logo({ size = 'sm', className, inverted }: LogoProps) {
  const s = SIZES[size];
  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      <LogoMark size={s.mark} />
      <span className="flex flex-col">
        <span className={cn('font-display leading-none tracking-tight', s.word, inverted ? 'text-white' : 'text-ink')}>
          Malodge
        </span>
        <span
          className={cn(
            'uppercase tracking-[0.28em] font-medium mt-1 leading-none',
            s.sub,
            inverted ? 'text-white/70' : 'text-muted',
          )}
        >
          Club Villa
        </span>
      </span>
    </span>
  );
}
