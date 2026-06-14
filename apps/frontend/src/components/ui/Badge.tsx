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
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-[#1A1A1D] text-[#6B6B6F] border-[#242428]',
  gold: 'bg-[#C9A96E]/10 text-[#C9A96E] border-[#C9A96E]/30',
  admin: 'bg-blue-900/30 text-blue-400 border-blue-800/50',
  super_admin: 'bg-red-900/30 text-red-400 border-red-800/50',
  manager: 'bg-purple-900/30 text-purple-400 border-purple-800/50',
  provider: 'bg-orange-900/30 text-orange-400 border-orange-800/50',
  client: 'bg-green-900/30 text-green-400 border-green-800/50',
  active: 'bg-green-900/30 text-green-400 border-green-800/50',
  inactive: 'bg-[#242428] text-[#6B6B6F] border-[#242428]',
  pending: 'bg-yellow-900/30 text-yellow-400 border-yellow-800/50',
  confirmed: 'bg-blue-900/30 text-blue-400 border-blue-800/50',
  cancelled: 'bg-red-900/30 text-red-400 border-red-800/50',
  completed: 'bg-[#242428] text-[#6B6B6F] border-[#242428]',
  success: 'bg-green-900/30 text-green-400 border-green-800/50',
  error: 'bg-red-900/30 text-red-400 border-red-800/50',
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = 'default', size = 'sm', children, className, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center border rounded-full font-medium',
          size === 'sm' ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1',
          variantClasses[variant],
          className,
        )}
        {...props}
      >
        {children}
      </span>
    );
  },
);

Badge.displayName = 'Badge';
