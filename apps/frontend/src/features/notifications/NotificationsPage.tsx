import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Bell, CheckCheck, CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { cn } from '../../lib/utils';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { apiClient } from '../../lib/apiClient';
import toast from 'react-hot-toast';

type FilterTab = 'all' | 'unread' | 'read';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  return `il y a ${Math.floor(hours / 24)}j`;
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'success':
      return { Icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-400/10' };
    case 'warning':
      return { Icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-400/10' };
    case 'error':
      return { Icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-400/10' };
    default:
      return { Icon: Info, color: 'text-blue-400', bg: 'bg-blue-400/10' };
  }
}

async function fetchNotifications(unreadOnly?: boolean) {
  const params = unreadOnly ? '?unreadOnly=true' : '';
  const res = await apiClient.get(`/notifications${params}`);
  const d = res.data?.data ?? res.data;
  return d?.items ?? d ?? [];
}

export function NotificationsPage() {
  const [filter, setFilter] = useState<FilterTab>('all');
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', filter],
    queryFn: () => fetchNotifications(filter === 'unread'),
  });

  const filtered =
    filter === 'read' ? notifications.filter((n: any) => n.isRead) : notifications;

  const markReadMutation = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiClient.patch('/notifications/read-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      toast.success('Toutes les notifications marquées comme lues');
    },
  });

  const TABS: { label: string; value: FilterTab }[] = [
    { label: 'Toutes', value: 'all' },
    { label: 'Non lues', value: 'unread' },
    { label: 'Lues', value: 'read' },
  ];

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Notifications"
        description="Restez informé des événements importants"
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={() => markAllReadMutation.mutate()}
          disabled={markAllReadMutation.isPending}
        >
          <CheckCheck size={14} className="mr-1.5" />
          Tout marquer comme lu
        </Button>
      </PageHeader>

      <div className="px-5 pb-5 flex flex-col gap-4 flex-1 overflow-hidden">
        {/* Filter tabs */}
        <div className="flex gap-1 bg-[#111113] border border-[#242428] rounded-xl p-1 self-start">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={cn(
                'px-4 py-1.5 rounded-lg text-xs transition-all duration-150',
                filter === tab.value
                  ? 'bg-[#C9A96E] text-[#0A0A0B] font-medium'
                  : 'text-[#6B6B6F] hover:text-[#F5F0EB]',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-start gap-4 p-4 bg-[#111113] border border-[#242428] rounded-xl"
              >
                <Skeleton width={36} height={36} rounded />
                <div className="flex-1 space-y-2">
                  <Skeleton height={12} width="40%" />
                  <Skeleton height={10} width="60%" />
                  <Skeleton height={8} width="20%" />
                </div>
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#1A1A1D] flex items-center justify-center">
                <Bell size={20} className="text-[#6B6B6F]" />
              </div>
              <div>
                <p className="text-sm text-[#F5F0EB]">Aucune notification</p>
                <p className="text-xs text-[#6B6B6F] mt-1">Vous êtes à jour</p>
              </div>
            </div>
          ) : (
            filtered.map((notif: any, i: number) => {
              const { Icon, color, bg } = getTypeIcon(notif.type);
              return (
                <motion.button
                  key={notif.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.2 }}
                  onClick={() => !notif.isRead && markReadMutation.mutate(notif.id)}
                  className={cn(
                    'w-full flex items-start gap-4 p-4 rounded-xl border text-left transition-all duration-150',
                    notif.isRead
                      ? 'bg-[#111113] border-[#242428] hover:border-[#242428]/80'
                      : 'bg-[#111113] border-l-2 border-l-[#C9A96E] border-r-[#242428] border-t-[#242428] border-b-[#242428] hover:border-l-[#E8C98A]',
                  )}
                >
                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', bg)}>
                    <Icon size={16} className={color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        'text-sm',
                        notif.isRead ? 'text-[#6B6B6F]' : 'text-[#F5F0EB] font-medium',
                      )}
                    >
                      {notif.title}
                    </p>
                    <p className="text-xs text-[#6B6B6F] mt-0.5 leading-relaxed">{notif.body}</p>
                    <p className="text-[10px] text-[#6B6B6F]/60 mt-1">{timeAgo(notif.createdAt)}</p>
                  </div>
                  {!notif.isRead && (
                    <span className="w-2 h-2 rounded-full bg-[#C9A96E] shrink-0 mt-1.5" />
                  )}
                </motion.button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
