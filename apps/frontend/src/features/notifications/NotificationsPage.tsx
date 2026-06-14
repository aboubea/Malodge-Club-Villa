import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Info, CheckCircle, AlertTriangle, XCircle, Check } from 'lucide-react';
import { formatDistanceToNow } from '../../lib/utils';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import apiClient from '../../lib/apiClient';

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  readAt?: string;
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  info:    { icon: Info,          color: 'text-blue-400',   bg: 'bg-blue-900/20' },
  success: { icon: CheckCircle,   color: 'text-green-400',  bg: 'bg-green-900/20' },
  warning: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-900/20' },
  error:   { icon: XCircle,       color: 'text-red-400',    bg: 'bg-red-900/20' },
};

export function NotificationsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', filter],
    queryFn: () =>
      apiClient
        .get('/notifications', {
          params: {
            unreadOnly: filter === 'unread' ? true : undefined,
            limit: 50,
          },
        })
        .then((r) => (r.data?.data ?? r.data) as Notification[]),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiClient.patch('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const notifications = Array.isArray(data) ? data : [];
  const visible = filter === 'read'
    ? notifications.filter((n) => n.isRead)
    : notifications;

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Notifications"
        description={unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? 's' : ''}` : 'Tout est à jour'}
      >
        {unreadCount > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => markAllReadMutation.mutate()}
            loading={markAllReadMutation.isPending}
          >
            <Check size={13} />
            Tout marquer comme lu
          </Button>
        )}
      </PageHeader>

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 bg-[#111113] border border-[#242428] rounded-xl w-fit">
        {([
          { value: 'all', label: 'Toutes' },
          { value: 'unread', label: 'Non lues' },
          { value: 'read', label: 'Lues' },
        ] as const).map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
              filter === tab.value
                ? 'bg-[#C9A96E] text-[#0A0A0B]'
                : 'text-[#6B6B6F] hover:text-[#F5F0EB]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Bell size={32} className="text-[#6B6B6F] mb-3" />
          <p className="text-sm text-[#6B6B6F]">Aucune notification</p>
        </div>
      ) : (
        <div className="space-y-1">
          {visible.map((n, i) => {
            const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.info;
            const Icon = cfg.icon;
            return (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => { if (!n.isRead) markReadMutation.mutate(n.id); }}
                className={`relative flex items-start gap-3 px-4 py-3.5 rounded-xl border transition-all duration-150 cursor-pointer ${
                  n.isRead
                    ? 'border-[#1A1A1D] bg-transparent hover:bg-[#111113]'
                    : 'border-[#C9A96E]/20 bg-[#111113] hover:bg-[#1A1A1D]'
                }`}
              >
                {/* Unread indicator */}
                {!n.isRead && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-8 bg-[#C9A96E] rounded-r-full" />
                )}

                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg}`}>
                  <Icon size={15} className={cfg.color} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${n.isRead ? 'text-[#6B6B6F]' : 'text-[#F5F0EB]'}`}>
                    {n.title}
                  </p>
                  <p className="text-xs text-[#6B6B6F] mt-0.5 leading-relaxed">{n.body}</p>
                </div>

                <p className="text-[10px] text-[#6B6B6F] shrink-0">
                  {formatDistanceToNow(n.createdAt)}
                </p>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
