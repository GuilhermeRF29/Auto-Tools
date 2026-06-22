import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
          secure: false,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: [
          '**/*.db',
          '**/*.db-wal',
          '**/*.db-shm',
          '**/*.pyc',
          '**/*.pyo',
          '**/__pycache__/**',
          '**/src_backend/data/**',
          '**/padrao/**',
          '**/tmp_out_test/**',
          '**/logs/**',
          '**/automacoes/auth.json',
          '**/automacoes/debug_*.png',
          '**/docs/**',
        ],
      },
    },
  };
});
