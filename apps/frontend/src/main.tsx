import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { queryClient } from './lib/queryClient';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#111113',
            color: '#F5F0EB',
            border: '1px solid #242428',
            borderRadius: '8px',
            fontSize: '14px',
          },
          success: {
            iconTheme: { primary: '#C9A96E', secondary: '#111113' },
          },
          error: {
            iconTheme: { primary: '#7A2D2D', secondary: '#F5F0EB' },
          },
        }}
      />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>,
);
