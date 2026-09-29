import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { resolveBranding } from '@security360/shared';

/**
 * Substitutes the brand into index.html at build time.
 *
 * The tab title and the two meta tags are the only places the product name is
 * written out rather than read from a constant, and static HTML cannot ask a
 * server what deployment it belongs to. Vite's own %VITE_FOO% replacement
 * leaves the placeholder in place when the variable is unset, which would ship
 * a tab reading "%APP_NAME%"; this resolves the default instead.
 */
function brandIndexHtml(): Plugin {
  return {
    name: 'brand-index-html',
    transformIndexHtml(html) {
      const { appName, appTagline } = resolveBranding(process.env);
      return html
        .replace(/%APP_NAME%/g, appName)
        .replace(/%APP_TAGLINE%/g, appTagline);
    },
  };
}

export default defineConfig({
  plugins: [react(), brandIndexHtml()],
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
