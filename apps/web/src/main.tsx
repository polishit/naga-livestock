import * as Sentry from '@sentry/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { ApiError } from './lib/api';
import { AuthProvider } from './lib/auth';
import './index.css';

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
      refetchOnWindowFocus: true,
      // Serve cached data while offline instead of failing.
      networkMode: 'offlineFirst',
    },
    mutations: { networkMode: 'always' },
  },
});

// Service worker: offline app shell + update prompt.
const updateSW = registerSW({
  onNeedRefresh() {
    toast('A new version is available.', {
      action: { label: 'Reload', onClick: () => updateSW(true) },
      duration: Infinity,
    });
  },
  onOfflineReady() {
    toast.success('Ready to work offline.');
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
          <Toaster position="top-right" richColors closeButton />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
