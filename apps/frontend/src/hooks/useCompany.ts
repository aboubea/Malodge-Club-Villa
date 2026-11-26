import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';

export interface Company {
  name: string;
  supportEmail: string;
  phone: string;
  website: string;
  /** False until it has been saved once in Paramètres › Général. */
  saved: boolean;
}

export const DEFAULT_COMPANY_NAME = 'Malodge Club Villa';

/** The company's name and contacts (Paramètres › Général), readable before signing in. */
export function useCompany() {
  return useQuery({
    queryKey: ['company'],
    queryFn: async () => {
      const r = await apiClient.get('/settings/company');
      return (r.data?.data ?? r.data) as Company;
    },
    staleTime: 10 * 60_000,
    retry: false,
  });
}

/** The company's name, the built-in one until it is known. */
export const useCompanyName = () => useCompany().data?.name || DEFAULT_COMPANY_NAME;

/** The browser tab says the company's name. */
export function useCompanyTitle() {
  const name = useCompanyName();
  useEffect(() => {
    document.title = `${name} — Conciergerie de luxe`;
  }, [name]);
}
