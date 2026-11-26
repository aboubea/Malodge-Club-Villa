import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { QUICK_ACTIONS } from './quickActions';

/** "+ Nouveau" in the top bar: add a reservation, an extra, a settlement… from anywhere. */
export function QuickAdd() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="relative hidden lg:block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn('h-10 pl-3 pr-4 rounded-full bg-primary text-on-primary text-[14px] font-semibold inline-flex items-center gap-1.5 hover:bg-primary-hover active:scale-[0.97] transition-all')}
      >
        <Plus size={17} strokeWidth={2.4} /> Nouveau
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 top-12 w-72 rounded-2xl border border-line bg-surface shadow-pop p-1.5 z-50"
            role="menu"
          >
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.key}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  navigate(a.url);
                }}
                className="w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-surface-2"
              >
                <span className="w-9 h-9 rounded-xl bg-peach text-accent flex items-center justify-center shrink-0">
                  <a.icon size={17} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-ink">{a.label}</span>
                  <span className="block text-[12px] text-muted truncate">{a.hint}</span>
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
