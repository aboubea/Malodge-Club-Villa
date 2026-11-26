import { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export function SlideOver({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: SlideOverProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 !m-0 z-50 flex justify-end">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-[rgb(20_16_10/0.4)] backdrop-blur-[3px]"
            onClick={onClose}
          />
          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
            className={cn(
              'relative flex flex-col w-full h-full',
              'bg-surface border-l border-line',
              'shadow-pop',
              sizeClasses[size],
            )}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-line shrink-0">
              <div>
                {title && (
                  <h2 className="font-display text-[26px] leading-tight text-ink">{title}</h2>
                )}
                {description && (
                  <p className="text-[13px] text-muted mt-1">{description}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 -mr-2 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2 transition-colors shrink-0"
                aria-label="Fermer"
              >
                <X size={16} />
              </button>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {/* Footer */}
            {footer && (
              <div className="px-6 py-4 border-t border-line shrink-0 bg-surface-2/50">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
