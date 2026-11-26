import { forwardRef, ButtonHTMLAttributes } from 'react';
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
    'bg-primary text-on-primary hover:bg-primary-hover border-transparent',
  secondary:
    'bg-surface text-ink border-line-strong hover:bg-surface-2',
  destructive:
    'bg-danger/10 text-danger border-danger/25 hover:bg-danger/15 hover:border-danger/40',
  ghost:
    'bg-transparent text-ink-soft border-transparent hover:text-ink hover:bg-surface-2',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3.5 text-[13px] gap-1.5 rounded-full',
  md: 'h-10 px-5 text-[14px] gap-2 rounded-full',
  lg: 'h-12 px-7 text-[15px] gap-2 rounded-full',
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
          'inline-flex items-center justify-center whitespace-nowrap border font-semibold select-none',
          'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.97]',
          'focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/20',
          'disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100',
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
