import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ShoppingCart, X, Plus, Minus, Clock, CheckCircle, Building2, CalendarDays, MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { apiClient } from '../../lib/apiClient';
import { formatCurrency } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';

interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
  icon?: string;
}

interface Service {
  id: string;
  name: string;
  description?: string;
  basePrice: number;
  duration?: number;
  images: string[];
  requiresDate: boolean;
  requiresTime: boolean;
  isActive: boolean;
  category: ServiceCategory;
}

interface CartItem {
  service: Service;
  quantity: number;
  scheduledAt?: string;
  notes?: string;
}

export function ServiceCataloguePage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isClient = user?.role === 'CLIENT';

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [orderNotes, setOrderNotes] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);

  const { data: categoriesData } = useQuery<ServiceCategory[]>({
    queryKey: ['service-categories'],
    queryFn: async () => {
      const res = await apiClient.get('/service-categories');
      return res.data.data ?? res.data;
    },
  });
  const categories = categoriesData ?? [];

  // Load client's reservations to get active stay and villa for pricing
  const { data: staysData } = useQuery({
    queryKey: ['client-stays-catalogue'],
    queryFn: async () => {
      const res = await apiClient.get('/reservations?limit=20');
      return (res.data.data ?? res.data)?.data ?? [];
    },
  });
  const clientStays: any[] = staysData ?? [];
  const now = new Date();
  const activeStay = clientStays.find(
    (r) => r.status === 'ACTIVE' || (r.status === 'CONFIRMED' && new Date(r.checkIn) <= now && new Date(r.checkOut) >= now),
  ) ?? clientStays.find((r) => r.status === 'CONFIRMED' && new Date(r.checkIn) > now);
  const clientVillas = clientStays
    .map((r: any) => r.villa)
    .filter(Boolean)
    .filter((v: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.id === v.id) === i);

  // Auto-select the active stay's villa
  const [selectedVillaId, setSelectedVillaId] = useState('');

  const effectiveVillaId = selectedVillaId || activeStay?.villa?.id || '';

  const { data, isLoading } = useQuery({
    queryKey: ['services-catalogue', search, selectedCategory, effectiveVillaId],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100', activeOnly: 'true' });
      if (search) params.set('search', search);
      if (selectedCategory) params.set('categoryId', selectedCategory);
      if (effectiveVillaId) params.set('villaId', effectiveVillaId);
      const res = await apiClient.get(`/services?${params}`);
      return res.data.data ?? res.data;
    },
  });
  const services: Service[] = (data?.data ?? data ?? []).filter((s: Service) => s.isActive);

  const orderMutation = useMutation({
    mutationFn: async () => {
      const items = cart.map((item) => ({
        serviceId: item.service.id,
        quantity: item.quantity,
        unitPrice: item.service.basePrice,
        notes: item.notes,
      }));
      return apiClient.post('/orders', {
        items,
        notes: orderNotes || undefined,
        scheduledAt: scheduledAt || undefined,
        reservationId: activeStay?.id || undefined,
        villaId: (selectedVillaId || activeStay?.villa?.id) || undefined,
      });
    },
    onSuccess: (res) => {
      toast.success('Commande passée avec succès !');
      const order = res.data?.data ?? res.data;
      if (order?.whatsappUrl) setWhatsappUrl(order.whatsappUrl);
      setCart([]);
      setCartOpen(false);
      setOrderNotes('');
      setScheduledAt('');
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: () => toast.error('Erreur lors de la commande'),
  });

  function addToCart(service: Service & { effectivePrice?: number }) {
    const priced = { ...service, basePrice: service.effectivePrice ?? service.basePrice };
    setCart((prev) => {
      const existing = prev.find((i) => i.service.id === service.id);
      if (existing) return prev.map((i) => i.service.id === service.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { service: priced, quantity: 1 }];
    });
    toast.success(`${service.name} ajouté au panier`);
  }

  function removeFromCart(serviceId: string) {
    setCart((prev) => prev.filter((i) => i.service.id !== serviceId));
  }

  function updateQty(serviceId: string, delta: number) {
    setCart((prev) => prev.map((i) => {
      if (i.service.id !== serviceId) return i;
      const newQty = i.quantity + delta;
      if (newQty <= 0) return i;
      return { ...i, quantity: newQty };
    }));
  }

  const totalAmount = cart.reduce((sum, i) => sum + i.service.basePrice * i.quantity, 0);
  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);
  const requiresSchedule = cart.some((i) => i.service.requiresDate || i.service.requiresTime);

  const groupedByCategory = categories.reduce<Record<string, Service[]>>((acc, cat) => {
    const catServices = services.filter((s) => s.category.id === cat.id);
    if (catServices.length > 0) acc[cat.id] = catServices;
    return acc;
  }, {});

  return (
    <div className="space-y-6 max-w-[1200px]">
      <PageHeader
        title={isClient ? 'Services' : 'Catalogue des services'}
        description={isClient ? 'Commandez nos services directement depuis votre espace' : 'Tous les services disponibles'}
      >
        {isClient && cartCount > 0 && (
          <Button variant="primary" icon={<ShoppingCart size={14} />} onClick={() => setCartOpen(true)}>
            Panier ({cartCount}) · {formatCurrency(totalAmount)}
          </Button>
        )}
      </PageHeader>

      {/* WhatsApp confirmation banner */}
      {whatsappUrl && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-green-500/20 bg-green-900/10">
          <MessageCircle size={18} className="text-green-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#F5F0EB]">Commande passée !</p>
            <p className="text-xs text-[#6B6B6F]">Contactez le prestataire via WhatsApp pour confirmer sa disponibilité</p>
          </div>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-medium transition-colors"
          >
            <MessageCircle size={12} /> WhatsApp
          </a>
          <button onClick={() => setWhatsappUrl(null)} className="text-[#6B6B6F] hover:text-[#F5F0EB]">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Active stay context banner */}
      {isClient && activeStay && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[#C9A96E]/20 bg-[#C9A96E]/5">
          <div className="w-10 h-10 rounded-lg bg-[#1A1A1D] overflow-hidden shrink-0">
            {activeStay.villa?.coverImage ? (
              <img src={activeStay.villa.coverImage} alt={activeStay.villa.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Building2 size={16} className="text-[#242428]" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-[#C9A96E] font-medium">Votre séjour actuel</p>
            <p className="text-sm text-[#F5F0EB] truncate">{activeStay.villa?.name} — {activeStay.villa?.city}</p>
            <p className="text-[11px] text-[#6B6B6F] flex items-center gap-1 mt-0.5">
              <CalendarDays size={9} />
              {new Date(activeStay.checkIn).toLocaleDateString('fr-FR')} → {new Date(activeStay.checkOut).toLocaleDateString('fr-FR')}
            </p>
          </div>
          <p className="text-[10px] text-[#6B6B6F]">Prix adaptés à votre villa</p>
        </div>
      )}

      {/* Search + category filters */}
      <div className="space-y-3">
        <div className="flex gap-3 flex-wrap items-end">
          <div className="w-64">
            <Input
              placeholder="Rechercher un service..."
              leftIcon={<Search size={13} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {clientVillas.length > 0 && (
            <div>
              <label className="text-xs font-medium text-[#6B6B6F] uppercase tracking-wider block mb-1.5">Villa</label>
              <select
                className="h-10 px-3 rounded-lg bg-[#111113] border border-[#242428] text-[#F5F0EB] text-sm focus:outline-none focus:border-[#C9A96E]/60"
                value={selectedVillaId}
                onChange={(e) => setSelectedVillaId(e.target.value)}
              >
                <option value="">Tous les services</option>
                {clientVillas.map((v: any) => (
                  <option key={v.id} value={v.id}>{v.name} — {v.city}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSelectedCategory('')}
            className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${!selectedCategory ? 'border-[#C9A96E]/40 bg-[#C9A96E]/10 text-[#C9A96E]' : 'border-[#242428] text-[#6B6B6F] hover:text-[#F5F0EB]'}`}
          >
            Tous
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id === selectedCategory ? '' : cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${selectedCategory === cat.id ? 'border-[#C9A96E]/40 bg-[#C9A96E]/10 text-[#C9A96E]' : 'border-[#242428] text-[#6B6B6F] hover:text-[#F5F0EB]'}`}
            >
              {cat.icon && <span className="mr-1">{cat.icon}</span>}{cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Services grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 rounded-xl bg-[#111113] border border-[#242428] animate-pulse" />
          ))}
        </div>
      ) : services.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm text-[#6B6B6F]">Aucun service disponible</p>
        </div>
      ) : selectedCategory ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((service, i) => (
            <ServiceCard key={service.id} service={service} index={i} onAdd={() => addToCart(service)} canOrder={isClient} />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedByCategory).map(([catId, catServices]) => {
            const cat = categories.find((c) => c.id === catId);
            if (!cat) return null;
            return (
              <div key={catId}>
                <h3 className="text-sm font-medium text-[#F5F0EB] mb-3 flex items-center gap-2">
                  {cat.icon && <span>{cat.icon}</span>}
                  {cat.name}
                  <span className="text-[#6B6B6F] font-normal">({catServices.length})</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {catServices.map((service, i) => (
                    <ServiceCard key={service.id} service={service} index={i} onAdd={() => addToCart(service)} canOrder={isClient} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cart modal */}
      <Modal open={cartOpen} onClose={() => setCartOpen(false)} title="Mon panier" size="lg">
        <div className="space-y-4">
          {cart.map((item) => (
            <div key={item.service.id} className="flex items-center gap-4 py-3 border-b border-[#242428]">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#F5F0EB] font-medium">{item.service.name}</p>
                <p className="text-xs text-[#6B6B6F]">{formatCurrency(item.service.basePrice)} / unité</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => updateQty(item.service.id, -1)} className="w-7 h-7 rounded-lg border border-[#242428] flex items-center justify-center text-[#6B6B6F] hover:text-[#F5F0EB] transition-colors">
                  <Minus size={12} />
                </button>
                <span className="text-sm text-[#F5F0EB] w-5 text-center">{item.quantity}</span>
                <button onClick={() => updateQty(item.service.id, +1)} className="w-7 h-7 rounded-lg border border-[#242428] flex items-center justify-center text-[#6B6B6F] hover:text-[#F5F0EB] transition-colors">
                  <Plus size={12} />
                </button>
              </div>
              <p className="text-sm text-[#C9A96E] w-20 text-right font-light">
                {formatCurrency(item.service.basePrice * item.quantity)}
              </p>
              <button onClick={() => removeFromCart(item.service.id)} className="text-[#6B6B6F] hover:text-red-400 transition-colors">
                <X size={14} />
              </button>
            </div>
          ))}

          {requiresSchedule && (
            <div>
              <label className="text-xs font-medium text-[#6B6B6F] uppercase tracking-wider">Date & heure souhaitée</label>
              <input
                type="datetime-local"
                className="w-full mt-1.5 h-10 px-3 rounded-lg bg-[#111113] border border-[#242428] text-[#F5F0EB] text-sm focus:outline-none focus:border-[#C9A96E]/60"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
          )}

          <Input
            label="Notes"
            placeholder="Instructions particulières..."
            value={orderNotes}
            onChange={(e) => setOrderNotes(e.target.value)}
          />

          <div className="flex items-center justify-between pt-2 border-t border-[#242428]">
            <div>
              <p className="text-xs text-[#6B6B6F]">Total</p>
              <p className="text-lg font-light text-[#C9A96E]">{formatCurrency(totalAmount)}</p>
            </div>
            <Button
              variant="primary"
              icon={<CheckCircle size={14} />}
              loading={orderMutation.isPending}
              onClick={() => orderMutation.mutate()}
            >
              Confirmer la commande
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ServiceCard({ service, index, onAdd, canOrder }: { service: Service & { effectivePrice?: number; providers?: any[] }; index: number; onAdd: () => void; canOrder?: boolean }) {
  const displayPrice = service.effectivePrice ?? service.basePrice;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.2 }}
    >
      <Card className="h-full flex flex-col group hover:border-[#C9A96E]/20 transition-colors">
        {service.images?.[0] ? (
          <div className="h-36 rounded-t-xl overflow-hidden">
            <img src={service.images[0]} alt={service.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          </div>
        ) : (
          <div className="h-36 rounded-t-xl bg-gradient-to-br from-[#1A1A1D] to-[#111113] flex items-center justify-center">
            <span className="text-3xl opacity-30">✨</span>
          </div>
        )}
        <CardContent className="flex flex-col flex-1 py-4 gap-3">
          <div className="flex-1">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h4 className="text-sm font-medium text-[#F5F0EB] leading-snug">{service.name}</h4>
              <Badge variant="default" className="shrink-0 text-[10px]">{service.category.name}</Badge>
            </div>
            {service.description && (
              <p className="text-xs text-[#6B6B6F] line-clamp-2">{service.description}</p>
            )}
            {service.duration && (
              <div className="flex items-center gap-1 mt-1.5">
                <Clock size={10} className="text-[#6B6B6F]" />
                <span className="text-[10px] text-[#6B6B6F]">{service.duration} min</span>
              </div>
            )}
          </div>
          {service.providers && service.providers.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap mt-1">
              {service.providers.slice(0, 2).map((sp: any) => (
                <span key={sp.provider.id} className="text-[10px] text-[#6B6B6F] px-1.5 py-0.5 rounded bg-[#1A1A1D] border border-[#242428]">
                  {sp.provider.user.firstName} {sp.provider.user.lastName}
                </span>
              ))}
              {service.providers.length > 2 && (
                <span className="text-[10px] text-[#6B6B6F]">+{service.providers.length - 2}</span>
              )}
            </div>
          )}
          <div className="flex items-center justify-between mt-2">
            <div>
              <p className="text-base font-light text-[#C9A96E]">{formatCurrency(displayPrice)}</p>
              {service.effectivePrice && service.effectivePrice !== service.basePrice && (
                <p className="text-[10px] text-[#6B6B6F] line-through">{formatCurrency(service.basePrice)}</p>
              )}
            </div>
            {canOrder && (
              <Button variant="primary" size="sm" icon={<Plus size={12} />} onClick={onAdd}>
                Ajouter
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
