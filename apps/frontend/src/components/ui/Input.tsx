import { forwardRef, InputHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftIcon, rightIcon, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-[#6B6B6F] uppercase tracking-wider"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6B6F] pointer-events-none">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full h-10 px-3 rounded-lg',
              'bg-[#111113] border border-[#242428]',
              'text-[#F5F0EB] text-sm placeholder:text-[#6B6B6F]',
              'transition-all duration-150',
              'focus:outline-none focus:border-[#C9A96E]/60 focus:ring-1 focus:ring-[#C9A96E]/20',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              error && 'border-red-800/70 focus:border-red-600/60 focus:ring-red-600/20',
              leftIcon && 'pl-9',
              rightIcon && 'pr-9',
              className,
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B6B6F] pointer-events-none">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        {hint && !error && <p className="text-xs text-[#6B6B6F]">{hint}</p>}
      </div>
    );
  },
);

Input.displayName = 'Input';
