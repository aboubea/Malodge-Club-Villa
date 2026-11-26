import { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  /** Small uppercase label above the title. */
  eyebrow?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, eyebrow, children, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-7 lg:mb-9',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent mb-2">{eyebrow}</p>
        )}
        <h1 className="font-display font-normal text-[34px] sm:text-[40px] leading-[1.05] tracking-[-0.01em] text-ink">
          {title}
        </h1>
        {description && <p className="text-[14px] text-muted mt-2">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}
