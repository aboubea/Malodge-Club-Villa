import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrainCircuit, Send, Sparkles } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { AiMessage } from './AiMessage';
import apiClient from '../../lib/apiClient';

interface Source {
  documentId: string;
  documentName: string;
  excerpt: string;
}

interface AiResponse {
  answer: string;
  sources: Source[];
  hasAnswer: boolean;
}

interface QA {
  id: string;
  question: string;
  answer: string;
  sources: Source[];
  hasAnswer: boolean;
}

const EXAMPLE_QUESTIONS = [
  'Comment préparer la villa avant l\'arrivée des clients ?',
  'Quels sont les services disponibles pour un transfert aéroport ?',
  'Quelles sont les règles de la maison pour Villa Émeraude ?',
];

function useAiQuery() {
  return useMutation({
    mutationFn: (question: string): Promise<AiResponse> =>
      apiClient.post('/ai/query', { question }).then((r) => r.data?.data ?? r.data),
  });
}

export function AiConciergePage() {
  const [history, setHistory] = useState<QA[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mutation = useAiQuery();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, mutation.isPending]);

  const handleSubmit = () => {
    const question = input.trim();
    if (!question || mutation.isPending) return;
    setInput('');
    mutation.mutate(question, {
      onSuccess: (data) => {
        setHistory((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            question,
            answer: data.answer,
            sources: data.sources ?? [],
            hasAnswer: data.hasAnswer,
          },
        ]);
      },
      onError: () => {
        setHistory((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            question,
            answer: 'Une erreur est survenue. Veuillez réessayer.',
            sources: [],
            hasAnswer: false,
          },
        ]);
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleExample = (q: string) => {
    setInput(q);
    textareaRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-56px)]">
      <div className="shrink-0">
        <PageHeader
          title="Concierge IA"
          description="Posez vos questions sur les villas, services, procédures et guides internes."
        />
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-0 py-4 space-y-6 min-h-0">
        {history.length === 0 && !mutation.isPending ? (
          /* Empty state */
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center justify-center h-full text-center py-16"
          >
            <div className="w-16 h-16 rounded-2xl bg-[#C9A96E]/10 border border-[#C9A96E]/20 flex items-center justify-center mb-5">
              <BrainCircuit size={28} className="text-[#C9A96E]" />
            </div>
            <h3 className="text-lg font-light text-[#F5F0EB] mb-2">
              Bonjour, comment puis-je vous aider ?
            </h3>
            <p className="text-sm text-[#6B6B6F] mb-8 max-w-sm leading-relaxed">
              Je réponds uniquement à partir de vos documents internes.
              Je n'invente jamais et n'accède pas à internet.
            </p>
            <div className="flex flex-col gap-2 w-full max-w-sm">
              {EXAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => handleExample(q)}
                  className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-[#242428] bg-[#111113] hover:border-[#C9A96E]/30 hover:bg-[#1A1A1D] transition-all duration-150 text-left group"
                >
                  <Sparkles size={13} className="text-[#C9A96E] shrink-0" />
                  <span className="text-sm text-[#6B6B6F] group-hover:text-[#F5F0EB] transition-colors leading-relaxed">
                    {q}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        ) : (
          <div className="space-y-6 max-w-3xl mx-auto w-full">
            {history.map((item, i) => (
              <AiMessage
                key={item.id}
                question={item.question}
                answer={item.answer}
                sources={item.sources}
                hasAnswer={item.hasAnswer}
                index={i}
              />
            ))}

            {/* Loading state */}
            <AnimatePresence>
              {mutation.isPending && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-start gap-3"
                >
                  <div className="w-7 h-7 rounded-lg bg-[#1A1A1D] border border-[#242428] flex items-center justify-center shrink-0">
                    <BrainCircuit size={14} className="text-[#C9A96E]" />
                  </div>
                  <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-[#111113] border border-[#242428]">
                    <div className="flex items-center gap-1.5">
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                          className="w-1.5 h-1.5 rounded-full bg-[#C9A96E]"
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 pt-3 pb-2">
        <div className="max-w-3xl mx-auto w-full">
          <div className="flex items-end gap-3 p-3 rounded-xl border border-[#242428] bg-[#111113] focus-within:border-[#C9A96E]/40 transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Posez votre question… (Entrée pour envoyer, Maj+Entrée pour un saut de ligne)"
              rows={1}
              className="flex-1 bg-transparent text-sm text-[#F5F0EB] placeholder:text-[#6B6B6F] resize-none focus:outline-none leading-relaxed min-h-[24px] max-h-40 overflow-y-auto"
              style={{ fieldSizing: 'content' } as React.CSSProperties}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              loading={mutation.isPending}
              disabled={!input.trim()}
              className="shrink-0"
            >
              <Send size={13} />
            </Button>
          </div>
          <p className="text-[10px] text-[#6B6B6F] text-center mt-2">
            Réponses basées exclusivement sur vos documents internes · Sources toujours citées
          </p>
        </div>
      </div>
    </div>
  );
}
