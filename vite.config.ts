import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://server:3000',
        changeOrigin: true,
        secure: false
      }
    }
  },
  envPrefix: 'VITE_',
  define: {
    'process.env': process.env
  },
  envDir: '.',  // Recherche les fichiers .env dans le répertoire racine
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  },
  resolve: {
    alias: {
      '@': '/src'  // Pour faciliter les imports
    }
  },
  css: {
    modules: {
      localsConvention: 'camelCase'
    }
  }
});