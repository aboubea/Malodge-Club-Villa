import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { apiClient } from '../../lib/apiClient';

/* ─────────────────────────────── Types ─────────────────────────────── */

export type AccountRole = 'CLIENT' | 'PROVIDER' | 'OWNER' | 'EMPLOYEE';
export type ExtraStatus = 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type SettlementStatus = 'PENDING' | 'VALIDATED' | 'CANCELLED';

export interface ExtraLine {
  id: string;
  orderId: string;
  date: string | null;
  status: ExtraStatus;
  notes: string | null;
  quantity: number | null;
  unitPrice: number | null;
  unitCost: number | null;
  label: string;
  serviceId: string | null;
  currency: string;
  cancelled: boolean;
  stay: { id: string; label: string; archived: boolean; clientId: string; checkIn?: string | null; checkOut?: string | null; datesEstimated?: boolean } | null;
  villa: { id: string; name: string; country: string; currency: string } | null;
  provider: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  seller: { id: string; name: string } | null;
  total: number | null;
  cost: number | null;
  margin: number | null;
  ownerRate: number | null;
  ownerShare: number | null;
  malodgeShare: number | null;
  sellerRate: number | null;
  sellerBase: 'MALODGE_MARGIN' | 'TOTAL_MARGIN' | null;
  sellerShare: number | null;
  net: number | null;
  issue: string | null;
  /** Non-blocking check, e.g. "Date hors séjour". */
  warning: string | null;
}

export interface Totals {
  currency: string;
  count: number;
  incomplete: number;
  billed: number;
  cost: number;
  margin: number;
  ownerShare: number;
  sellerShare: number;
  net: number;
}

export type AccountState = 'Réglé' | 'Partiel' | 'Non réglé' | 'Avance' | 'Rien à régler' | 'À compléter';

export interface Account {
  role: AccountRole;
  id: string;
  name: string;
  currency: string;
  due: number;
  paid: number;
  balance: number;
  state: AccountState;
  extrasCount: number;
  incompleteCount: number;
  archived?: boolean;
  lastSettlement?: string | null;
  meta?: { villa?: string; checkIn?: string; checkOut?: string; datesEstimated?: boolean; contact?: string | null; rate?: number | null; base?: string | null; villas?: string[] };
}

export interface Settlement {
  id: string;
  kind: string;
  kindLabel: string;
  role: AccountRole;
  status: SettlementStatus;
  date: string | null;
  amount: number;
  currency: string;
  netSettled: number;
  treasury: number;
  method: 'CASH' | 'TRANSFER' | 'CARD' | 'MANUAL' | null;
  reference: string | null;
  note: string | null;
  person: { id: string; name: string };
  stay: { id: string; label: string; villa: string } | null;
  createdBy: string | null;
  validatedBy: string | null;
  validatedAt: string | null;
  createdAt: string;
}

export interface Summary {
  currencies: {
    currency: string;
    clientsToCollect: number;
    archivedToCollect: number;
    providersToPay: number;
    ownersToPay: number;
    employeesToPay: number;
    activeNet: number;
    treasury: number;
  }[];
  alerts: { incompleteExtras: number; dateWarnings: number; staysToDate: number; pendingSettlements: number; settingsToCheck: number };
  topClients: Account[];
  topOwners: Account[];
  topEmployees: Account[];
  topProviders: Account[];
  recentSettlements: Settlement[];
}

export interface Stay {
  id: string;
  label: string;
  clientId: string;
  contact: string | null;
  villaId: string;
  villa: string;
  currency: string;
  checkIn: string;
  checkOut: string;
  archived: boolean;
  datesEstimated: boolean;
  notes: string | null;
  issue: string | null;
}

export interface Person {
  id: string;
  role: AccountRole | 'PROVIDER';
  name: string;
  contact: string | null;
  email: string | null;
  canLogin: boolean;
  commissionRate: number | null;
  commissionBase: 'MALODGE_MARGIN' | 'TOTAL_MARGIN' | null;
  notes: string | null;
  villas: { id: string; name: string }[];
  issue: string | null;
}

export interface VillaRef {
  id: string;
  name: string;
  city: string;
  country: string;
  currency: string;
  ownerId: string | null;
  isActive: boolean;
  /** Synced from Lodgify (read-only source). */
  lodgify?: boolean;
  stays?: number;
  extras?: number;
  /** Likely Lodgify listings for the same house. */
  duplicates?: { id: string; name: string; score: number }[];
}

export interface CatalogueItem {
  id: string;
  name: string;
  category: string;
  unit: string | null;
  unitCost: number | null;
  publicPrice: number | null;
  proposedPrice: number | null;
  currency: string;
  isActive: boolean;
  defaultProvider: { id: string; name: string } | null;
}

export interface Options {
  markup: number;
  stays: Stay[];
  villas: VillaRef[];
  providers: { id: string; name: string }[];
  owners: { id: string; name: string }[];
  sellers: { id: string; name: string }[];
  catalogue: CatalogueItem[];
  settlementKinds: { kind: string; role: AccountRole; label: string; balance: 1 | -1; treasury: 1 | -1 }[];
}

export interface ExtraFilters {
  stayId?: string;
  villaId?: string;
  providerId?: string;
  ownerId?: string;
  sellerId?: string;
  status?: string;
  from?: string;
  to?: string;
  stays?: 'active' | 'archived' | 'all';
  incomplete?: 'true';
  search?: string;
}

/* ─────────────────────────────── Labels ────────────────────────────── */

export const STATUS_LABELS: Record<ExtraStatus, string> = {
  PENDING: 'À confirmer',
  CONFIRMED: 'Confirmée',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Réalisée',
  CANCELLED: 'Annulée',
};

export const STATUS_BADGE: Record<ExtraStatus, 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled'> = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const ROLE_LABELS: Record<AccountRole, { one: string; many: string }> = {
  CLIENT: { one: 'Client / séjour', many: 'Clients' },
  OWNER: { one: 'Propriétaire', many: 'Propriétaires' },
  PROVIDER: { one: 'Prestataire', many: 'Prestataires' },
  EMPLOYEE: { one: 'Salarié', many: 'Salariés' },
};

export const METHOD_LABELS: Record<string, string> = { CASH: 'Espèces', TRANSFER: 'Virement', CARD: 'Carte', MANUAL: 'Autre' };

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  PENDING: 'À valider',
  VALIDATED: 'Validé',
  CANCELLED: 'Annulé',
};

export const STATE_BADGE: Record<AccountState, 'success' | 'pending' | 'error' | 'confirmed' | 'inactive' | 'gold'> = {
  Réglé: 'success',
  Partiel: 'pending',
  'Non réglé': 'error',
  Avance: 'confirmed',
  'Rien à régler': 'inactive',
  'À compléter': 'gold',
};

/* ─────────────────────────────── Hooks ─────────────────────────────── */

const unwrap = <T,>(r: { data: { data?: T } & T }) => (r.data?.data ?? r.data) as T;
const clean = (o: object) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== undefined && v !== null));

export const useExtrasSummary = () =>
  useQuery({ queryKey: ['extras', 'summary'], queryFn: async () => unwrap<Summary>(await apiClient.get('/extras/summary')) });

export const useExtrasOptions = () =>
  useQuery({ queryKey: ['extras', 'options'], queryFn: async () => unwrap<Options>(await apiClient.get('/extras/options')), staleTime: 30_000 });

export const useExtraLines = (filters: ExtraFilters) =>
  useQuery({
    queryKey: ['extras', 'lines', filters],
    queryFn: async () =>
      unwrap<{ lines: ExtraLine[]; totals: Totals[] }>(await apiClient.get('/extras/lines', { params: clean(filters) })),
    placeholderData: (prev) => prev,
  });

export const useAccounts = (role: AccountRole) =>
  useQuery({
    queryKey: ['extras', 'accounts', role],
    queryFn: async () => unwrap<Account[]>(await apiClient.get('/extras/accounts', { params: { role } })),
  });

export const useSettlements = (filters: { role?: string; status?: string; from?: string; to?: string; personId?: string }) =>
  useQuery({
    queryKey: ['extras', 'settlements', filters],
    queryFn: async () =>
      unwrap<{ settlements: Settlement[]; totals: { currency: string; inflow: number; outflow: number; net: number; pending: number }[] }>(
        await apiClient.get('/extras/settlements', { params: clean(filters) }),
      ),
    placeholderData: (prev) => prev,
  });

export const useExtrasSettings = () =>
  useQuery({
    queryKey: ['extras', 'settings'],
    queryFn: async () => unwrap<{ markup: number; people: Person[]; villas: VillaRef[]; stays: Stay[] }>(await apiClient.get('/extras/settings')),
  });

export const useCatalogue = () =>
  useQuery({
    queryKey: ['extras', 'catalogue'],
    queryFn: async () => unwrap<{ markup: number; items: CatalogueItem[] }>(await apiClient.get('/extras/catalogue')),
  });

/** Every write refreshes the whole extras cache: totals and accounts depend on everything. */
export function useExtrasMutation<TVars>(fn: (vars: TVars) => Promise<unknown>, success?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['extras'] });
      if (success) toast.success(success);
    },
  });
}

export const api = {
  saveExtra: (vars: { id?: string; body: Record<string, unknown> }) =>
    vars.id ? apiClient.put(`/extras/lines/${vars.id}`, vars.body) : apiClient.post('/extras/lines', vars.body),
  deleteExtra: (id: string) => apiClient.delete(`/extras/lines/${id}`),
  createSettlement: (body: Record<string, unknown>) => apiClient.post('/extras/settlements', body),
  updateSettlement: (vars: { id: string; body: Record<string, unknown> }) => apiClient.patch(`/extras/settlements/${vars.id}`, vars.body),
  settlementAction: (vars: { id: string; action: 'validate' | 'cancel' | 'reopen' }) =>
    apiClient.post(`/extras/settlements/${vars.id}/${vars.action}`),
  savePerson: (vars: { id?: string; body: Record<string, unknown> }) =>
    vars.id ? apiClient.patch(`/extras/people/${vars.id}`, vars.body) : apiClient.post('/extras/people', vars.body),
  saveStay: (vars: { id?: string; body: Record<string, unknown> }) =>
    vars.id ? apiClient.put(`/extras/stays/${vars.id}`, vars.body) : apiClient.post('/extras/stays', vars.body),
  updateVilla: (vars: { id: string; body: Record<string, unknown> }) => apiClient.patch(`/extras/villas/${vars.id}`, vars.body),
  mergeVilla: (vars: { id: string; targetId: string }) => apiClient.post(`/extras/villas/${vars.id}/merge`, { targetId: vars.targetId }),
  saveCatalogueItem: (vars: { id?: string; body: Record<string, unknown> }) =>
    vars.id ? apiClient.patch(`/extras/catalogue/${vars.id}`, vars.body) : apiClient.post('/extras/catalogue', vars.body),
  setMarkup: (markup: number) => apiClient.put('/extras/settings', { markup }),
};

export const pct = (rate: number | null | undefined) =>
  rate === null || rate === undefined ? '—' : `${Math.round(rate * 1000) / 10}\u00a0%`;

export const toDateInput = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');
