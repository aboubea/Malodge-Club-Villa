import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';

export interface DashboardKpis {
  totalRevenue: number;
  revenueChange: number;
  activeReservations: number;
  pendingOrders: number;
  activeVillas: number;
  totalVillas: number;
  occupancyRate: number;
  activeClients: number;
  ordersThisMonth: number;
}

export interface DashboardReservation {
  id: string;
  checkIn: string;
  checkOut: string;
  status: string;
  totalAmount?: number;
  client: { id: string; firstName: string; lastName: string; email: string; avatar?: string };
  villa: { id: string; name: string; city: string; coverImage?: string };
}

export interface DashboardData {
  kpis: DashboardKpis;
  recentReservations: DashboardReservation[];
}

export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await apiClient.get('/dashboard');
      return res.data.data ?? res.data;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
