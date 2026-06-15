import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';

export interface Country { code: string; name: string; flag: string; }

export function useCountries() {
  return useQuery<Country[]>({
    queryKey: ['settings-countries'],
    queryFn: async () => {
      const res = await apiClient.get('/settings/countries');
      return res.data.data ?? res.data;
    },
    staleTime: 5 * 60_000,
  });
}
