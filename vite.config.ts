import { defineConfig } from 'vite';

// Dev: `/` · Production / GitHub Pages: `/Marcovaldo/`
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Marcovaldo/' : '/',
  // Localhost only — avoids LAN bind overhead and stale multi-host sessions.
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  optimizeDeps: {
    include: ['fontkit']
  },
  build: {
    target: 'es2022',
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('node_modules/fontkit') ||
            id.includes('node_modules/restructure') ||
            id.includes('node_modules/unicode-')
          ) {
            return 'fontkit';
          }
          if (id.includes('node_modules/pdf-lib')) return 'pdf';
        }
      }
    }
  }
}));
