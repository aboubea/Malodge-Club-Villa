import { ReactNode, SelectHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react';
import { ChevronDown, Inbox } from 'lucide-react';
import { cn, formatMoney } from '../../lib/utils';

const fieldBase =
  'w-full h-10 rounded-xl bg-surface border border-line text-ink text-[13.5px] placeholder:text-muted/80 ' +
  'hover:border-line-strong focus:outline-none focus:border-ink/25 focus:ring-4 focus:ring-ink/5 transition-[border-color,box-shadow] ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

export function Field({ label, hint, error, children, className }: { label?: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1.5 min-w-0', className)}>
      {label && <span className="text-[12.5px] font-semibold text-ink-soft">{label}</span>}
      {children}
      {error ? <span className="text-[12px] text-danger">{error}</span> : hint ? <span className="text-[12px] text-muted">{hint}</span> : null}
    </label>
  );
}

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <span className="relative block">
    <select ref={ref} className={cn(fieldBase, 'appearance-none pl-3.5 pr-9 truncate', className)} {...props}>
      {children}
    </select>
    <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
  </span>
));
Select.displayName = 'Select';

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldBase, 'px-3.5', className)} {...props} />
));
TextInput.displayName = 'TextInput';

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, 'h-auto min-h-[72px] px-3.5 py-2.5 resize-y', className)} {...props} />
));
TextArea.displayName = 'TextArea';

export function Money({ value, currency, className, signed }: { value: number | null | undefined; currency: string; className?: string; signed?: boolean }) {
  const text = formatMoney(value, currency);
  return (
    <span className={cn('tabular whitespace-nowrap', value === null || value === undefined ? 'text-muted' : '', className)}>
      {signed && value !== null && value !== undefined && value > 0 ? '+' : ''}
      {text}
    </span>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = 'default',
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'peach' | 'warning';
  icon?: React.ElementType;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-5 flex flex-col gap-3 min-w-0',
        tone === 'peach' ? 'bg-peach border-transparent' : 'bg-surface border-line',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-muted leading-snug">{label}</p>
        {Icon && (
          <span className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0', tone === 'peach' ? 'bg-surface/70' : 'bg-surface-2')}>
            <Icon size={15} className={tone === 'warning' ? 'text-warning' : 'text-ink-soft'} />
          </span>
        )}
      </div>
      <p className="text-[22px] sm:text-[24px] font-bold text-ink leading-none tracking-tight tabular">{value}</p>
      {hint && <p className="text-[12px] text-muted -mt-1">{hint}</p>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; count?: number }[];
  className?: string;
}) {
  return (
    <div className={cn('inline-flex p-1 rounded-full bg-surface-2 border border-line max-w-full overflow-x-auto scrollbar-none', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-8 px-3.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap transition-colors inline-flex items-center gap-1.5',
            value === o.value ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
          {o.count !== undefined && o.count > 0 && (
            <span className={cn('min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] flex items-center justify-center', value === o.value ? 'bg-primary text-on-primary' : 'bg-line text-ink-soft')}>
              {o.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <span className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mb-3">
        <Inbox size={20} className="text-muted" />
      </span>
      <p className="text-[14px] font-semibold text-ink">{title}</p>
      {hint && <p className="text-[13px] text-muted mt-1 max-w-sm">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Table shell matching the app's cards. */
export function TableCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-line bg-surface overflow-hidden', className)}>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export const th = 'px-4 py-3 text-left text-[12px] font-semibold text-muted whitespace-nowrap bg-surface-2/60 border-b border-line';
export const td = 'px-4 py-3 text-[13px] text-ink align-middle';

export function IssueTag({ issue }: { issue: string | null }) {
  if (!issue) return null;
  return (
    <span className="inline-flex items-center h-6 px-2 rounded-full bg-warning/10 text-warning text-[11.5px] font-semibold whitespace-nowrap">
      {issue}
    </span>
  );
}
