import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { Avatar } from '../../components/ui/Avatar';
import { MessageBubble } from './MessageBubble';
import { Skeleton } from '../../components/ui/Skeleton';
import { apiClient } from '../../lib/apiClient';
import { getSocket } from '../../lib/socket';
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
  const [sending, setSending] = useState(false);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  const { data: conversation, isLoading } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => fetchConversation(conversationId),
  });

  useEffect(() => {
    if (conversation?.messages) {
      setMessages(conversation.messages);
    }
  }, [conversation]);

  useEffect(() => {
    const socket = getSocket();
    socket.emit('join_conversation', { conversationId });
    socket.emit('mark_read', { conversationId });

    const handleNewMessage = (msg: any) => {
      setMessages((prev) => {
        if (prev.find((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
    };

    const handleTyping = (data: { userId: string; conversationId: string }) => {
      if (data.conversationId === conversationId && data.userId !== user?.id) {
        setTypingUser(data.userId);
        if (typingTimeout.current) clearTimeout(typingTimeout.current);
        typingTimeout.current = setTimeout(() => setTypingUser(null), 3000);
      }
    };

    socket.on('new_message', handleNewMessage);
    socket.on('user_typing', handleTyping);

    return () => {
      socket.emit('leave_conversation', { conversationId });
      socket.off('new_message', handleNewMessage);
      socket.off('user_typing', handleTyping);
    };
  }, [conversationId, user?.id, queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    const socket = getSocket();
    socket.emit('send_message', { conversationId, content: input.trim(), type: 'text' });
    setInput('');
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const socket = getSocket();
    socket.emit('typing', { conversationId });
  };

  // Group messages by date
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
              style={{
                width: `${40 + Math.random() * 40}%`,
                marginLeft: i % 2 === 0 ? 'auto' : undefined,
              }}
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
                <p className="text-[10px] text-[#6B6B6F]">
                  {conversation.reservation.villa.name}
                </p>
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
        {groupedMessages.map((group) => (
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
        ))}

        {typingUser && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 mt-2"
          >
            <div className="bg-[#1A1A1D] border border-[#242428] rounded-2xl rounded-bl-sm px-4 py-2.5">
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
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[#242428] p-3 flex items-end gap-2 shrink-0">
        <textarea
          value={input}
          onChange={handleInputChange}
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
          disabled={!input.trim() || sending}
          className={cn(
            'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150',
            input.trim() && !sending
              ? 'bg-[#C9A96E] text-[#0A0A0B] hover:bg-[#E8C98A]'
              : 'bg-[#1A1A1D] text-[#6B6B6F] cursor-not-allowed',
          )}
        >
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  );
}
