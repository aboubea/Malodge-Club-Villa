import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  // Version shown in the app, to check which deployment is live.
  define: {
    __APP_VERSION__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7)),
    __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@malodge/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Libraries change rarely: kept in their own files, browsers reuse them across deployments.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query', 'axios', 'zustand'],
          motion: ['framer-motion'],
          realtime: ['socket.io-client'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
