import { forwardRef, ButtonHTMLAttributes } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { Loader2 } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[#C9A96E] text-[#0A0A0B] hover:bg-[#E8C98A] border-transparent font-medium',
  secondary:
    'bg-transparent text-[#F5F0EB] border-[#242428] hover:bg-[#1A1A1D] hover:border-[#C9A96E]/40',
  destructive:
    'bg-[#7A2D2D]/20 text-red-400 border-[#7A2D2D]/50 hover:bg-[#7A2D2D]/30',
  ghost:
    'bg-transparent text-[#6B6B6F] border-transparent hover:text-[#F5F0EB] hover:bg-[#1A1A1D]',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-6 text-base gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled,
      icon,
      children,
      className,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={cn(
          'inline-flex items-center justify-center rounded-lg border transition-all duration-150 ease-out',
          'focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/30 focus:ring-offset-1 focus:ring-offset-[#0A0A0B]',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {loading ? (
          <Loader2 className="animate-spin shrink-0" size={size === 'sm' ? 12 : 14} />
        ) : icon ? (
          <span className="shrink-0">{icon}</span>
        ) : null}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
