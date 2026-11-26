import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AppRouter } from './router/AppRouter';
import { useThemeSync } from './hooks/useTheme';
import { IntroSplash } from './components/brand/IntroSplash';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from './lib/apiClient';
import { setDisplayCurrency, setDisplayQuote } from './lib/display';
import { useUIStore } from './store/uiStore';
import { useAuthStore } from './store/authStore';
import { useCompanyTitle } from './hooks/useCompany';

/**
 * The display currency (top bar) and today's rates, set before the pages render:
 * every amount is then shown in that one currency.
 */
function useDisplayCurrency() {
  const currency = useUIStore((s) => s.currency);
  const signedIn = useAuthStore((s) => !!s.accessToken);
  const { data: quote } = useQuery({
    queryKey: ['fx'],
    queryFn: async () => {
      const res = await apiClient.get('/fx');
      return (res.data?.data ?? res.data) as { rates: Record<string, number>; date: string } | null;
    },
    // Signed-in pages only (the guest and provider spaces show their villa's currency).
    enabled: signedIn,
    staleTime: 60 * 60_000,
    retry: false,
  });
  setDisplayCurrency(currency);
  setDisplayQuote(signedIn ? quote ?? null : null);
}

export default function App() {
  useThemeSync();
  useDisplayCurrency();
  useCompanyTitle();

  return (
    <BrowserRouter>
      <AppRouter />
      <IntroSplash />
      <Toaster
        position="top-right"
        toastOptions={{
          className: 'shadow-pop',
          style: {
            background: 'rgb(var(--c-surface))',
            color: 'rgb(var(--c-ink))',
            border: '1px solid rgb(var(--c-line))',
            borderRadius: '12px',
            fontSize: '13px',
            padding: '10px 14px',
          },
          success: {
            iconTheme: { primary: 'rgb(var(--c-success))', secondary: 'rgb(var(--c-surface))' },
          },
          error: {
            iconTheme: { primary: 'rgb(var(--c-danger))', secondary: 'rgb(var(--c-surface))' },
          },
        }}
      />
    </BrowserRouter>
  );
}
