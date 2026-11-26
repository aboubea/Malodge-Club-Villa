import { motion } from 'framer-motion';
import { Brain } from 'lucide-react';
import { cn } from '../../lib/utils';
import { AiSourceCard } from './AiSourceCard';

interface Source {
  documentId: string;
  documentName: string;
  excerpt: string;
}

interface Props {
  question: string;
  answer: string;
  sources: Source[];
  hasAnswer: boolean;
  index: number;
}

export function AiMessage({ question, answer, sources, hasAnswer, index }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.05 }}
      className="space-y-3"
    >
      {/* Question bubble */}
      <div className="flex justify-end">
        <div className="max-w-lg bg-primary text-on-primary rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed">
          {question}
        </div>
      </div>

      {/* Answer bubble */}
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-surface-2 border border-line flex items-center justify-center shrink-0">
          <Brain size={14} className="text-accent" />
        </div>
        <div className="flex-1 space-y-2">
          <div
            className={cn(
              'rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed border',
              hasAnswer
                ? 'bg-surface-2 border-line text-ink'
                : 'bg-surface-2 border-line text-muted italic',
            )}
          >
            {answer}
          </div>
          {hasAnswer && sources.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted uppercase tracking-wider font-medium px-1">
                Sources
              </p>
              {sources.map((src) => (
                <AiSourceCard
                  key={src.documentId}
                  documentName={src.documentName}
                  excerpt={src.excerpt}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
