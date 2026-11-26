import { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
}: ModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 !m-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-[rgb(20_16_10/0.45)] backdrop-blur-[3px]"
            onClick={onClose}
          />
          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cn(
              'relative w-full flex flex-col',
              'rounded-t-3xl sm:rounded-2xl max-h-[92dvh] sm:max-h-[88vh]',
              'bg-surface border border-line',
              'shadow-pop',
              sizeClasses[size],
              className,
            )}
          >
            {/* Header */}
            {(title || description) && (
              <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 shrink-0">
                <div>
                  {title && (
                    <h2 className="font-display font-semibold text-[19px] leading-tight text-ink">{title}</h2>
                  )}
                  {description && (
                    <p className="text-[13px] text-muted mt-1">{description}</p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="w-9 h-9 -mr-2 -mt-1 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2 transition-colors shrink-0"
                  aria-label="Fermer"
                >
                  <X size={16} />
                </button>
              </div>
            )}
            {!title && (
              <button
                onClick={onClose}
                className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2 transition-colors z-10"
                aria-label="Fermer"
              >
                <X size={16} />
              </button>
            )}
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-6 pb-6 pt-1">{children}</div>
            {/* Footer */}
            {footer && (
              <div className="px-6 py-4 border-t border-line shrink-0 bg-surface-2/50 rounded-b-none sm:rounded-b-2xl">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
