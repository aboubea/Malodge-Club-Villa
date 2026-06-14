import { motion } from 'framer-motion';
import { BrainCircuit } from 'lucide-react';
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
      transition={{ delay: index * 0.05, duration: 0.25 }}
      className="space-y-3"
    >
      {/* Question — right aligned */}
      <div className="flex justify-end">
        <div className="max-w-[75%] px-4 py-2.5 rounded-2xl rounded-tr-sm bg-[#C9A96E]/15 border border-[#C9A96E]/20">
          <p className="text-sm text-[#F5F0EB] leading-relaxed">{question}</p>
        </div>
      </div>

      {/* Answer — left aligned */}
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-lg bg-[#1A1A1D] border border-[#242428] flex items-center justify-center shrink-0 mt-0.5">
          <BrainCircuit size={14} className="text-[#C9A96E]" />
        </div>
        <div className="flex-1 min-w-0 space-y-2.5">
          <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-[#111113] border border-[#242428]">
            {hasAnswer ? (
              <p className="text-sm text-[#F5F0EB] leading-relaxed whitespace-pre-wrap">{answer}</p>
            ) : (
              <p className="text-sm text-[#6B6B6F] italic leading-relaxed">{answer}</p>
            )}
          </div>

          {/* Sources */}
          {sources.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-[#6B6B6F] uppercase tracking-wider px-1">Sources</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {sources.map((s) => (
                  <AiSourceCard
                    key={s.documentId}
                    documentName={s.documentName}
                    excerpt={s.excerpt}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
