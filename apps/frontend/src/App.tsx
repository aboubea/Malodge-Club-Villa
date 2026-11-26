import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AppRouter } from './router/AppRouter';
import { useThemeSync } from './hooks/useTheme';

export default function App() {
  useThemeSync();

  return (
    <BrowserRouter>
      <AppRouter />
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
