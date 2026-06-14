import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Brain, Send, Loader2, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { PageHeader } from '../../components/layout/PageHeader';
import { AiMessage } from './AiMessage';
import { apiClient } from '../../lib/apiClient';

interface QA {
  question: string;
  answer: string;
  sources: { documentId: string; documentName: string; excerpt: string }[];
  hasAnswer: boolean;
}

const EXAMPLE_QUESTIONS = [
  "Comment préparer la villa pour l'arrivée d'un client ?",
  'Quels sont les services disponibles pour les prestataires ?',
  'Quelle est la procédure en cas de problème technique ?',
];

async function queryAI(question: string): Promise<QA> {
  const res = await apiClient.post('/ai/query', { question });
  return res.data?.data ?? res.data;
}

export function AiConciergePage() {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<QA[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const mutation = useMutation({
    mutationFn: (q: string) => queryAI(q),
    onSuccess: (result, question) => {
      setHistory((prev) => [...prev, { question, ...result }]);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, mutation.isPending]);

  const handleSubmit = () => {
    if (!input.trim() || mutation.isPending) return;
    const q = input.trim();
    setInput('');
    mutation.mutate(q);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleExample = (q: string) => {
    setInput(q);
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Concierge IA"
        description="Posez vos questions sur les villas, services, procédures et guides internes."
      />

      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {history.length === 0 && !mutation.isPending ? (
          /* Empty state */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center justify-center min-h-[400px] text-center gap-6"
          >
            <div className="w-16 h-16 rounded-2xl bg-[#1A1A1D] border border-[#242428] flex items-center justify-center">
              <Brain size={28} className="text-[#C9A96E]" />
            </div>
            <div>
              <p className="text-lg font-light text-[#F5F0EB]">Bonjour, comment puis-je vous aider ?</p>
              <p className="text-sm text-[#6B6B6F] mt-1.5">
                Je suis votre concierge IA. Posez-moi une question sur les documents de Mahodge Club
                Villa.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {EXAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => handleExample(q)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[#242428] bg-[#111113] text-xs text-[#6B6B6F] hover:text-[#F5F0EB] hover:border-[#C9A96E]/30 transition-all duration-150"
                >
                  <Sparkles size={11} className="text-[#C9A96E]" />
                  {q}
                </button>
              ))}
            </div>
          </motion.div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6 py-4">
            {history.map((qa, i) => (
              <AiMessage key={i} {...qa} index={i} />
            ))}

            {mutation.isPending && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#1A1A1D] border border-[#242428] flex items-center justify-center shrink-0">
                  <Brain size={14} className="text-[#C9A96E]" />
                </div>
                <div className="bg-[#1A1A1D] border border-[#242428] rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1 items-center">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-[#6B6B6F]"
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-[#242428] px-5 py-4 shrink-0">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-3 bg-[#111113] border border-[#242428] rounded-2xl px-4 py-3 focus-within:border-[#C9A96E]/40 transition-all duration-150">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Posez votre question... (Entrée pour envoyer)"
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-[#F5F0EB] placeholder:text-[#6B6B6F] focus:outline-none max-h-32"
              style={{ minHeight: '24px' }}
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || mutation.isPending}
              className={cn(
                'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150',
                input.trim() && !mutation.isPending
                  ? 'bg-[#C9A96E] text-[#0A0A0B] hover:bg-[#E8C98A]'
                  : 'bg-[#1A1A1D] text-[#6B6B6F] cursor-not-allowed',
              )}
            >
              {mutation.isPending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Send size={13} />
              )}
            </button>
          </div>
          <p className="text-[10px] text-[#6B6B6F] mt-2 text-center">
            Répond uniquement à partir des documents indexés. Ne jamais inventer d'information.
          </p>
        </div>
      </div>
    </div>
  );
}
