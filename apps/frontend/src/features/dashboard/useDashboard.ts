import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';

export interface DashboardKpis {
  totalRevenue: number;
  revenueChange: number;
  serviceRevenue: number;
  serviceRevenueChange: number;
  occupancyRate: number;
  activeReservations: number;
  pendingOrders: number;
  pendingOrdersChange: number;
  activeVillas: number;
  totalVillas: number;
  activeClients: number;
  ordersThisMonth: number;
  ordersChange: number;
}

export interface DashboardReservation {
  id: string;
  client: { firstName: string; lastName: string };
  villa: string;
  checkIn: string;
  checkOut: string;
  status: string;
  amount: number;
}

export interface DashboardVilla {
  id: string;
  name: string;
  city: string;
  revenue: number;
  reservations: number;
  occupancy: number;
}

export interface DashboardData {
  kpis: DashboardKpis;
  recentReservations: DashboardReservation[];
  topVillas: DashboardVilla[];
}

export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: DashboardData }>('/dashboard');
      return res.data.data ?? (res.data as any);
    },
    refetchInterval: 60_000, // refresh every minute
    staleTime: 30_000,
  });
}
