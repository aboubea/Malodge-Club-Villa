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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={cn(
              'relative w-full rounded-2xl flex flex-col',
              'max-h-[90vh]',
              'bg-[#111113] border border-[#242428]',
              'shadow-2xl shadow-black/50',
              sizeClasses[size],
              className,
            )}
          >
            {/* Header */}
            {(title || description) && (
              <div className="flex items-start justify-between px-6 py-5 border-b border-[#242428] shrink-0">
                <div>
                  {title && (
                    <h2 className="text-base font-light text-[#F5F0EB]">{title}</h2>
                  )}
                  {description && (
                    <p className="text-xs text-[#6B6B6F] mt-1">{description}</p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="text-[#6B6B6F] hover:text-[#F5F0EB] transition-colors ml-4 mt-0.5 shrink-0"
                >
                  <X size={16} />
                </button>
              </div>
            )}
            {!title && (
              <button
                onClick={onClose}
                className="absolute top-4 right-4 text-[#6B6B6F] hover:text-[#F5F0EB] transition-colors z-10"
              >
                <X size={16} />
              </button>
            )}
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {/* Footer */}
            {footer && (
              <div className="px-6 py-4 border-t border-[#242428] shrink-0 bg-[#0A0A0B]">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
