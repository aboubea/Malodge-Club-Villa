import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AppRouter } from './router/AppRouter';

export default function App() {
  return (
    <BrowserRouter>
      <AppRouter />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#111113',
            color: '#F5F0EB',
            border: '1px solid #242428',
            borderRadius: '8px',
            fontSize: '13px',
          },
          success: {
            iconTheme: { primary: '#C9A96E', secondary: '#0A0A0B' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#0A0A0B' },
          },
        }}
      />
    </BrowserRouter>
  );
}
