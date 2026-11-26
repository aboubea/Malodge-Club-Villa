import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/utils';

type BadgeVariant =
  | 'default'
  | 'gold'
  | 'admin'
  | 'manager'
  | 'provider'
  | 'client'
  | 'super_admin'
  | 'active'
  | 'inactive'
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'success'
  | 'error';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  /** Show a leading status dot (defaults to true for status variants). */
  dot?: boolean;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-surface-2 text-ink-soft',
  gold: 'bg-gold/15 text-accent',
  admin: 'bg-info/10 text-info',
  super_admin: 'bg-danger/10 text-danger',
  manager: 'bg-plum/10 text-plum',
  provider: 'bg-copper/10 text-copper',
  client: 'bg-success/10 text-success',
  active: 'bg-success/10 text-success',
  inactive: 'bg-surface-2 text-muted',
  pending: 'bg-warning/10 text-warning',
  confirmed: 'bg-info/10 text-info',
  cancelled: 'bg-danger/10 text-danger',
  completed: 'bg-surface-2 text-muted',
  success: 'bg-success/10 text-success',
  error: 'bg-danger/10 text-danger',
};

const DOT_VARIANTS = new Set<BadgeVariant>(['active', 'inactive', 'pending', 'confirmed', 'cancelled', 'completed', 'success', 'error']);

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = 'default', size = 'sm', dot, children, className, ...props }, ref) => {
    const showDot = dot ?? DOT_VARIANTS.has(variant);
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap leading-none',
          size === 'sm' ? 'text-[11.5px] h-6 px-2.5' : 'text-xs h-7 px-3',
          variantClasses[variant],
          className,
        )}
        {...props}
      >
        {showDot && <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" aria-hidden />}
        {children}
      </span>
    );
  },
);

Badge.displayName = 'Badge';
