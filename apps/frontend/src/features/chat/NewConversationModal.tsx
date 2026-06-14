import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { apiClient } from '../../lib/apiClient';
import { useAuthStore } from '../../store/authStore';

interface Props {
  onClose: () => void;
  onCreated: (convId: string) => void;
}

async function fetchUsers() {
  const res = await apiClient.get('/users');
  return (res.data?.data?.items ?? res.data?.data ?? res.data?.items ?? res.data ?? []) as any[];
}

export function NewConversationModal({ onClose, onCreated }: Props) {
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [topic, setTopic] = useState('');
  const queryClient = useQueryClient();

  const { data: users = [] } = useQuery({ queryKey: ['users-list'], queryFn: fetchUsers });

  const filtered = users.filter(
    (u: any) =>
      u.id !== user?.id &&
      (`${u.firstName} ${u.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
        u.email?.toLowerCase().includes(search.toLowerCase())),
  );

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedUser) throw new Error('No user selected');
      const res = await apiClient.post('/chat/conversations', {
        participantIds: [selectedUser.id],
        topic: topic || undefined,
      });
      return res.data?.data ?? res.data;
    },
    onSuccess: (conv) => {
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] });
      onCreated(conv.id);
    },
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="bg-[#111113] border border-[#242428] rounded-2xl w-full max-w-md shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#242428]">
          <p className="text-sm font-medium text-[#F5F0EB]">Nouvelle conversation</p>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#6B6B6F] hover:text-[#F5F0EB] hover:bg-[#1A1A1D] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Topic */}
          <div>
            <label className="block text-xs text-[#6B6B6F] mb-1.5">Sujet (optionnel)</label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Sujet de la conversation..."
              className="w-full h-9 px-3 rounded-lg text-sm bg-[#1A1A1D] border border-[#242428] text-[#F5F0EB] placeholder:text-[#6B6B6F] focus:outline-none focus:border-[#C9A96E]/40"
            />
          </div>

          {/* User search */}
          <div>
            <label className="block text-xs text-[#6B6B6F] mb-1.5">Destinataire</label>
            <div className="relative mb-2">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6B6B6F]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un utilisateur..."
                className="w-full h-9 pl-8 pr-3 rounded-lg text-sm bg-[#1A1A1D] border border-[#242428] text-[#F5F0EB] placeholder:text-[#6B6B6F] focus:outline-none focus:border-[#C9A96E]/40"
              />
            </div>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-[#242428] bg-[#1A1A1D]">
              {filtered.slice(0, 10).map((u: any) => (
                <button
                  key={u.id}
                  onClick={() => setSelectedUser(u)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                    selectedUser?.id === u.id ? 'bg-[#C9A96E]/10' : 'hover:bg-[#242428]',
                  )}
                >
                  <Avatar src={u.avatar} firstName={u.firstName} lastName={u.lastName} size="sm" />
                  <div>
                    <p className="text-xs font-medium text-[#F5F0EB]">
                      {u.firstName} {u.lastName}
                    </p>
                    <p className="text-[10px] text-[#6B6B6F]">{u.role}</p>
                  </div>
                  {selectedUser?.id === u.id && (
                    <span className="ml-auto w-4 h-4 rounded-full bg-[#C9A96E] flex items-center justify-center">
                      <span className="text-[8px] text-[#0A0A0B] font-bold">✓</span>
                    </span>
                  )}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-xs text-[#6B6B6F] text-center py-4">Aucun utilisateur trouvé</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#242428]">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Annuler
          </Button>
          <Button
            size="sm"
            disabled={!selectedUser || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Création...' : 'Créer'}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
