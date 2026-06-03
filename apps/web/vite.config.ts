import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals:     true,
    environment: 'jsdom',
    setupFiles:  ['./src/test-setup.ts'],
    include:     ['src/**/*.test.{ts,tsx}'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
