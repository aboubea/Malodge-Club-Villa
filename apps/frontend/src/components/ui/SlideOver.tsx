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
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className={cn(
              'relative flex flex-col w-full h-full',
              'bg-[#111113] border-l border-[#242428]',
              'shadow-2xl shadow-black/50',
              sizeClasses[size],
            )}
          >
            {/* Header */}
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
            {/* Content */}
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
