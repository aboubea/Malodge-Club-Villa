import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Avatar } from '../../components/ui/Avatar';
import { MessageBubble } from './MessageBubble';
import { Skeleton } from '../../components/ui/Skeleton';
import { apiClient } from '../../lib/apiClient';
import { useAuthStore } from '../../store/authStore';

interface Props {
  conversationId: string;
}

async function fetchConversation(id: string) {
  const res = await apiClient.get(`/chat/conversations/${id}`);
  return res.data?.data ?? res.data;
}

export function MessageThread({ conversationId }: Props) {
  const { user } = useAuthStore();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: conversation, isLoading } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => fetchConversation(conversationId),
    refetchInterval: 4000,
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      apiClient.post(`/chat/conversations/${conversationId}/messages`, { content, type: 'text' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages]);

  useEffect(() => {
    apiClient.patch(`/chat/conversations/${conversationId}/read`).catch(() => {});
  }, [conversationId]);

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || sendMutation.isPending) return;
    setInput('');
    sendMutation.mutate(content);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const messages: any[] = conversation?.messages ?? [];

  const groupedMessages = messages.reduce<{ date: string; msgs: any[] }[]>((groups, msg) => {
    const date = new Date(msg.createdAt).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
    });
    const last = groups[groups.length - 1];
    if (last && last.date === date) {
      last.msgs.push(msg);
    } else {
      groups.push({ date, msgs: [msg] });
    }
    return groups;
  }, []);

  const otherParticipant = conversation?.participants?.find(
    (p: any) => p.user.id !== user?.id,
  )?.user;

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="h-14 border-b border-[#242428] flex items-center px-4 gap-3">
          <Skeleton circle width={32} height={32} />
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="flex-1 p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-10 rounded-xl"
              style={{ width: `${40 + Math.random() * 40}%`, marginLeft: i % 2 === 0 ? 'auto' : undefined }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-14 border-b border-[#242428] flex items-center px-4 gap-3 shrink-0">
        {otherParticipant && (
          <>
            <Avatar
              src={otherParticipant.avatar}
              firstName={otherParticipant.firstName}
              lastName={otherParticipant.lastName}
              size="sm"
            />
            <div>
              <p className="text-sm font-medium text-[#F5F0EB]">
                {otherParticipant.firstName} {otherParticipant.lastName}
              </p>
              {conversation?.reservation?.villa?.name && (
                <p className="text-[10px] text-[#6B6B6F]">{conversation.reservation.villa.name}</p>
              )}
            </div>
          </>
        )}
        {conversation?.topic && !otherParticipant && (
          <p className="text-sm font-medium text-[#F5F0EB]">{conversation.topic}</p>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-sm text-[#6B6B6F]">Aucun message — démarrez la conversation</p>
          </div>
        ) : (
          groupedMessages.map((group) => (
            <div key={group.date}>
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-[#242428]" />
                <span className="text-[10px] text-[#6B6B6F] whitespace-nowrap">{group.date}</span>
                <div className="flex-1 h-px bg-[#242428]" />
              </div>
              {group.msgs.map((msg) => (
                <MessageBubble key={msg.id} message={msg} isMe={msg.sender.id === user?.id} />
              ))}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[#242428] p-3 flex items-end gap-2 shrink-0">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Écrivez votre message... (Entrée pour envoyer)"
          rows={1}
          className={cn(
            'flex-1 resize-none rounded-xl px-3 py-2.5 text-sm',
            'bg-[#111113] border border-[#242428] text-[#F5F0EB] placeholder:text-[#6B6B6F]',
            'focus:outline-none focus:border-[#C9A96E]/40 focus:ring-1 focus:ring-[#C9A96E]/20',
            'max-h-32 transition-all duration-150',
          )}
          style={{ minHeight: '40px' }}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || sendMutation.isPending}
          className={cn(
            'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150',
            input.trim() && !sendMutation.isPending
              ? 'bg-[#C9A96E] text-[#0A0A0B] hover:bg-[#E8C98A]'
              : 'bg-[#1A1A1D] text-[#6B6B6F] cursor-not-allowed',
          )}
        >
          {sendMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  );
}
