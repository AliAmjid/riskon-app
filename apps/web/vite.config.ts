import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = env.VITE_API_URL ?? 'http://localhost:3000';

  if (process.env.NETLIFY && !env.VITE_API_URL) {
    throw new Error(
      'Set VITE_API_URL to the public API origin (no trailing slash) before building on Netlify.',
    );
  }

  return {
    plugins: [react()],
    optimizeDeps: {
      exclude: ['@duckdb/duckdb-wasm'],
    },
    worker: {
      format: 'es',
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        '/socket.io': {
          target: apiUrl,
          ws: true,
        },
      },
    },
  };
});
