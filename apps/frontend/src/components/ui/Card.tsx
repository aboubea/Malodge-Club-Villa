import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  gold?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, className, hover = false, gold = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-xl border border-[#242428] bg-[#111113]',
          'transition-all duration-200',
          hover && 'hover:border-[#C9A96E]/30 hover:bg-[#1A1A1D] cursor-pointer',
          gold && 'border-[#C9A96E]/20',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);

Card.displayName = 'Card';

interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {}

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ children, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('px-5 py-4 border-b border-[#242428]', className)}
      {...props}
    >
      {children}
    </div>
  ),
);

CardHeader.displayName = 'CardHeader';

interface CardContentProps extends HTMLAttributes<HTMLDivElement> {}

export const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
  ({ children, className, ...props }, ref) => (
    <div ref={ref} className={cn('px-5 py-4', className)} {...props}>
      {children}
    </div>
  ),
);

CardContent.displayName = 'CardContent';

interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {}

export const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
  ({ children, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('px-5 py-3 border-t border-[#242428]', className)}
      {...props}
    >
      {children}
    </div>
  ),
);

CardFooter.displayName = 'CardFooter';

interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {}

export const CardTitle = forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ children, className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-base font-light text-[#F5F0EB]', className)}
      {...props}
    >
      {children}
    </h3>
  ),
);

CardTitle.displayName = 'CardTitle';
