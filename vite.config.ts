import { defineConfig } from 'vite';

// Dev: `/` · Production / GitHub Pages: `/Marcovaldo/`
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Marcovaldo/' : '/',
  server: { host: true, port: 5173, strictPort: true },
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
