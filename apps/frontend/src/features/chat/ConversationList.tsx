import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Avatar } from '../../components/ui/Avatar';
import { Skeleton } from '../../components/ui/Skeleton';
import { apiClient } from '../../lib/apiClient';
import { useAuthStore } from '../../store/authStore';

interface Conversation {
  id: string;
  topic?: string;
  participants: { user: { id: string; firstName: string; lastName: string; avatar?: string } }[];
  messages: { content: string; createdAt: string; sender: { firstName: string } }[];
  unreadCount: number;
  updatedAt: string;
}

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}j`;
}

async function fetchConversations() {
  const res = await apiClient.get('/chat/conversations');
  return (res.data?.data ?? res.data) as Conversation[];
}

export function ConversationList({ selectedId, onSelect, onNew }: Props) {
  const [search, setSearch] = useState('');
  const { user } = useAuthStore();
  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['chat-conversations'],
    queryFn: fetchConversations,
    refetchInterval: 10000,
  });

  const filtered = conversations.filter((conv) => {
    const other = conv.participants.find((p) => p.user.id !== user?.id);
    const name = other ? `${other.user.firstName} ${other.user.lastName}` : conv.topic || '';
    return name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="w-72 shrink-0 flex flex-col bg-[#0A0A0B]">
      {/* Search */}
      <div className="p-3 border-b border-[#242428]">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6B6B6F]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="w-full h-8 pl-8 pr-3 rounded-lg text-xs bg-[#111113] border border-[#242428] text-[#F5F0EB] placeholder:text-[#6B6B6F] focus:outline-none focus:border-[#C9A96E]/40"
          />
        </div>
      </div>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto py-1">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-3">
              <Skeleton className="w-9 h-9 rounded-full shrink-0" circle />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-2.5 w-36" />
              </div>
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <p className="text-xs text-[#6B6B6F]">Aucune conversation</p>
          </div>
        ) : (
          filtered.map((conv) => {
            const other = conv.participants.find((p) => p.user.id !== user?.id)?.user;
            const displayName = other
              ? `${other.firstName} ${other.lastName}`
              : conv.topic || 'Conversation';
            const lastMsg = conv.messages[0];
            const isSelected = conv.id === selectedId;

            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-3 text-left transition-colors relative',
                  isSelected
                    ? 'bg-[#C9A96E]/10 border-l-2 border-[#C9A96E]'
                    : 'hover:bg-[#111113] border-l-2 border-transparent',
                )}
              >
                <Avatar
                  src={other?.avatar}
                  firstName={other?.firstName || '?'}
                  lastName={other?.lastName || ''}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-[#F5F0EB] truncate">{displayName}</p>
                    {lastMsg && (
                      <span className="text-[10px] text-[#6B6B6F] shrink-0">
                        {timeAgo(lastMsg.createdAt)}
                      </span>
                    )}
                  </div>
                  {lastMsg && (
                    <p className="text-[11px] text-[#6B6B6F] truncate mt-0.5">{lastMsg.content}</p>
                  )}
                </div>
                {conv.unreadCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-[#C9A96E] text-[#0A0A0B] text-[9px] font-bold flex items-center justify-center shrink-0">
                    {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
