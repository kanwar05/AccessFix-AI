import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const clientRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, clientRoot, '');
  const port = Number(env.CLIENT_PORT || 5173);
  const apiTarget = new URL(env.API_PROXY_TARGET || 'http://127.0.0.1:3001');

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('CLIENT_PORT must be an integer between 1 and 65535.');
  }

  if (
    apiTarget.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(apiTarget.hostname) ||
    apiTarget.username || apiTarget.password ||
    apiTarget.pathname !== '/' || apiTarget.search || apiTarget.hash
  ) {
    throw new Error('API_PROXY_TARGET must be a local HTTP origin, such as http://127.0.0.1:3001.');
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: '127.0.0.1',
      port,
      strictPort: true,
      proxy: { '/api': { target: apiTarget.origin } },
    },
  };
});
