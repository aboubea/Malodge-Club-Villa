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
        'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6 lg:mb-7',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[12px] font-semibold text-accent mb-1.5">{eyebrow}</p>
        )}
        <h1 className="text-[22px] sm:text-[26px] font-bold leading-tight tracking-tight text-ink">
          {title}
        </h1>
        {description && <p className="text-[13.5px] text-muted mt-1">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}
