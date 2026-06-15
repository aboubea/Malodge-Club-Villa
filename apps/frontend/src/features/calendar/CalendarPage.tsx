import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Plus, X, Building2, ShoppingBag, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { apiClient } from '../../lib/apiClient';
import { useAuthStore } from '../../store/authStore';
import { cn } from '../../lib/utils';

const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const TYPE_COLORS: Record<string, string> = {
  reservation: 'bg-[#C9A96E]/20 text-[#C9A96E] border-[#C9A96E]/30',
  order: 'bg-purple-900/20 text-purple-400 border-purple-800/30',
  activity: 'bg-blue-900/20 text-blue-400 border-blue-800/30',
  maintenance: 'bg-orange-900/20 text-orange-400 border-orange-800/30',
  event: 'bg-green-900/20 text-green-400 border-green-800/30',
};

const TYPE_ICONS: Record<string, React.ElementType> = {
  reservation: Building2,
  order: ShoppingBag,
  activity: Calendar,
  event: Calendar,
  maintenance: Calendar,
};

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  type: string;
  color?: string;
  villaId?: string;
  villa?: { id: string; name: string; city?: string };
  reservationId?: string;
  orderId?: string;
  client?: { id: string; firstName: string; lastName: string };
  source: string;
}

interface NewEventForm {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  type: string;
  allDay: boolean;
  color: string;
}

const DEFAULT_FORM: NewEventForm = {
  title: '',
  description: '',
  startAt: '',
  endAt: '',
  type: 'activity',
  allDay: false,
  color: '#22c55e',
};

export function CalendarPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isStaff = user?.role && ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role);
  const isClient = user?.role === 'CLIENT';

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [newEventOpen, setNewEventOpen] = useState(false);
  const [form, setForm] = useState<NewEventForm>(DEFAULT_FORM);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const from = new Date(year, month, 1).toISOString();
  const to = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

  const { data, isLoading } = useQuery<{ data: CalendarEvent[] }>({
    queryKey: ['calendar', year, month, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ from, to });
      if (typeFilter !== 'all') params.set('type', typeFilter);
      const res = await apiClient.get(`/calendar?${params}`);
      return res.data.data ?? res.data;
    },
  });
  const events: CalendarEvent[] = data?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (payload: Omit<NewEventForm, 'allDay'> & { allDay: boolean }) =>
      apiClient.post('/calendar', payload),
    onSuccess: () => {
      toast.success('Événement créé');
      qc.invalidateQueries({ queryKey: ['calendar'] });
      setNewEventOpen(false);
      setForm(DEFAULT_FORM);
    },
    onError: () => toast.error('Erreur lors de la création'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/calendar/${id}`),
    onSuccess: () => {
      toast.success('Événement supprimé');
      qc.invalidateQueries({ queryKey: ['calendar'] });
    },
  });

  // Build calendar grid
  const firstDayOfMonth = new Date(year, month, 1);
  const startDay = (firstDayOfMonth.getDay() + 6) % 7; // Monday-based
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startDay + daysInMonth) / 7) * 7;
  const days = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - startDay + 1;
    if (dayNum < 1 || dayNum > daysInMonth) return null;
    return new Date(year, month, dayNum);
  });

  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach((e) => {
      const start = new Date(e.startAt);
      const end = new Date(e.endAt);
      let cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      while (cur <= endDay) {
        const key = cur.toISOString().slice(0, 10);
        if (!map[key]) map[key] = [];
        map[key].push(e);
        cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
      }
    });
    return map;
  }, [events]);

  const selectedDayKey = selectedDay ? selectedDay.toISOString().slice(0, 10) : null;
  const selectedDayEvents = selectedDayKey ? (eventsByDay[selectedDayKey] || []) : [];

  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);

  function prevMonth() { setCurrentDate(new Date(year, month - 1, 1)); }
  function nextMonth() { setCurrentDate(new Date(year, month + 1, 1)); }
  function openNewEvent(day?: Date) {
    const d = day || new Date();
    const iso = d.toISOString().slice(0, 16);
    setForm({ ...DEFAULT_FORM, startAt: iso, endAt: iso });
    setNewEventOpen(true);
  }

  const TYPE_OPTIONS = [
    { value: 'all', label: 'Tous' },
    { value: 'reservation', label: 'Réservations' },
    { value: 'order', label: 'Commandes' },
    { value: 'activity', label: 'Activités' },
    { value: 'event', label: 'Événements' },
    { value: 'maintenance', label: 'Maintenance' },
  ];

  return (
    <div className="space-y-6 max-w-[1400px]">
      <PageHeader
        title="Agenda"
        description={`${events.length} événement${events.length !== 1 ? 's' : ''} ce mois`}
      >
        {isStaff && (
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => openNewEvent()}>
            Nouvel événement
          </Button>
        )}
      </PageHeader>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setTypeFilter(opt.value)}
            className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${typeFilter === opt.value ? 'border-[#C9A96E]/40 bg-[#C9A96E]/10 text-[#C9A96E]' : 'border-[#242428] text-[#6B6B6F] hover:text-[#F5F0EB]'}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6">
        {/* Calendar grid */}
        <Card>
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#242428]">
            <button onClick={prevMonth} className="p-1.5 text-[#6B6B6F] hover:text-[#F5F0EB] transition-colors">
              <ChevronLeft size={16} />
            </button>
            <h2 className="text-sm font-medium text-[#F5F0EB]">
              {MONTHS_FR[month]} {year}
            </h2>
            <button onClick={nextMonth} className="p-1.5 text-[#6B6B6F] hover:text-[#F5F0EB] transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-[#242428]">
            {DAYS_FR.map((d) => (
              <div key={d} className="px-2 py-2 text-center text-[10px] font-medium text-[#6B6B6F] uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>

          {/* Days grid */}
          {isLoading ? (
            <div className="py-16 text-center">
              <div className="w-6 h-6 border-2 border-[#C9A96E]/30 border-t-[#C9A96E] rounded-full animate-spin mx-auto" />
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {days.map((day, idx) => {
                if (!day) return <div key={idx} className="h-24 border-b border-r border-[#1A1A1D] last:border-r-0" />;
                const key = day.toISOString().slice(0, 10);
                const dayEvents = eventsByDay[key] || [];
                const isToday = key === todayKey;
                const isSelected = selectedDayKey === key;
                const isCurrentMonth = day.getMonth() === month;

                return (
                  <div
                    key={key}
                    onClick={() => setSelectedDay(day)}
                    className={cn(
                      'h-24 border-b border-r border-[#1A1A1D] p-1.5 cursor-pointer transition-colors overflow-hidden',
                      'hover:bg-[#111113]',
                      isSelected && 'bg-[#C9A96E]/5 border-[#C9A96E]/20',
                      !isCurrentMonth && 'opacity-30',
                    )}
                  >
                    <div className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-xs mb-1 font-medium transition-colors',
                      isToday ? 'bg-[#C9A96E] text-[#0A0A0B]' : 'text-[#6B6B6F]',
                      isSelected && !isToday && 'text-[#F5F0EB]',
                    )}>
                      {day.getDate()}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((e) => (
                        <div
                          key={e.id}
                          className={cn(
                            'text-[9px] px-1 py-0.5 rounded truncate border',
                            TYPE_COLORS[e.type] || 'bg-[#1A1A1D] text-[#6B6B6F] border-[#242428]',
                          )}
                        >
                          {e.title}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div className="text-[9px] text-[#6B6B6F] px-1">+{dayEvents.length - 3}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Day detail panel */}
        <div className="space-y-4">
          {selectedDay ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedDayKey}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#F5F0EB]">
                      {selectedDay.getDate()} {MONTHS_FR[selectedDay.getMonth()]}
                    </p>
                    <p className="text-xs text-[#6B6B6F]">{selectedDayEvents.length} événement(s)</p>
                  </div>
                  {isStaff && (
                    <Button variant="secondary" size="sm" icon={<Plus size={12} />} onClick={() => openNewEvent(selectedDay)}>
                      Ajouter
                    </Button>
                  )}
                </div>

                {selectedDayEvents.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <p className="text-xs text-[#6B6B6F]">Aucun événement ce jour</p>
                    </CardContent>
                  </Card>
                ) : (
                  selectedDayEvents.map((e) => {
                    const Icon = TYPE_ICONS[e.type] || Calendar;
                    const isCustom = e.source === 'custom';
                    return (
                      <Card key={e.id} className={cn('border', TYPE_COLORS[e.type]?.split(' ').find(c => c.startsWith('border-')) || '')}>
                        <CardContent className="py-3">
                          <div className="flex items-start gap-2.5">
                            <Icon size={14} className={TYPE_COLORS[e.type]?.split(' ').find(c => c.startsWith('text-')) || 'text-[#6B6B6F]'} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-[#F5F0EB] font-medium leading-snug">{e.title}</p>
                              {e.description && <p className="text-xs text-[#6B6B6F] mt-0.5">{e.description}</p>}
                              {e.villa && <p className="text-[11px] text-[#6B6B6F] mt-1">📍 {e.villa.name}</p>}
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] text-[#6B6B6F]">
                                  {new Date(e.startAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                  {' → '}
                                  {new Date(e.endAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </div>
                            {isStaff && isCustom && (
                              <button
                                onClick={() => deleteMutation.mutate(e.id)}
                                className="text-[#6B6B6F] hover:text-red-400 transition-colors shrink-0"
                              >
                                <X size={12} />
                              </button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </motion.div>
            </AnimatePresence>
          ) : (
            <Card>
              <CardContent className="py-10 text-center">
                <Calendar size={24} className="mx-auto text-[#242428] mb-2" />
                <p className="text-xs text-[#6B6B6F]">Cliquez sur un jour pour voir les événements</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* New event modal */}
      {isStaff && (
        <Modal open={newEventOpen} onClose={() => { setNewEventOpen(false); setForm(DEFAULT_FORM); }} title="Nouvel événement" size="lg">
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); if (!form.title || !form.startAt || !form.endAt) return; createMutation.mutate(form); }}
          >
            <Input
              label="Titre"
              placeholder="Maintenance piscine, Activité yoga..."
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-[#6B6B6F] uppercase tracking-wider">Début</label>
                <input
                  type="datetime-local"
                  className="w-full mt-1.5 h-10 px-3 rounded-lg bg-[#111113] border border-[#242428] text-[#F5F0EB] text-sm focus:outline-none focus:border-[#C9A96E]/60"
                  value={form.startAt}
                  onChange={(e) => setForm((p) => ({ ...p, startAt: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#6B6B6F] uppercase tracking-wider">Fin</label>
                <input
                  type="datetime-local"
                  className="w-full mt-1.5 h-10 px-3 rounded-lg bg-[#111113] border border-[#242428] text-[#F5F0EB] text-sm focus:outline-none focus:border-[#C9A96E]/60"
                  value={form.endAt}
                  onChange={(e) => setForm((p) => ({ ...p, endAt: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-[#6B6B6F] uppercase tracking-wider">Type</label>
              <select
                className="w-full mt-1.5 h-10 px-3 rounded-lg bg-[#111113] border border-[#242428] text-[#F5F0EB] text-sm focus:outline-none focus:border-[#C9A96E]/60"
                value={form.type}
                onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
              >
                <option value="activity">Activité</option>
                <option value="event">Événement</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>

            <Input
              label="Description (optionnel)"
              placeholder="Détails de l'événement..."
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />

            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.allDay}
                onChange={(e) => setForm((p) => ({ ...p, allDay: e.target.checked }))}
                className="w-4 h-4 rounded border border-[#242428] bg-[#111113] accent-[#C9A96E]"
              />
              <span className="text-sm text-[#F5F0EB]">Toute la journée</span>
            </label>

            <Button
              type="submit"
              variant="primary"
              loading={createMutation.isPending}
              className="w-full"
              disabled={!form.title || !form.startAt || !form.endAt}
            >
              Créer l'événement
            </Button>
          </form>
        </Modal>
      )}
    </div>
  );
}
