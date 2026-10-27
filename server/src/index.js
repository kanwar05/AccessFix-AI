import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createApp } from './app.js';
import { createConfig } from './config.js';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

try {
  const config = createConfig();
  const server = createApp({ config }).listen(config.port, config.host, () => {
    console.log(`AccessFix AI API: http://${config.host}:${config.port}`);
    console.log(`Phase 3: scan target ${config.previewUrl}; local model ${config.ollamaModel}. Proposals are never applied or verified.`);
  });

  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE'
      ? `Port ${config.port} is in use. Stop the other process or update PORT and API_PROXY_TARGET.`
      : `The API could not start: ${error.message}`);
    process.exitCode = 1;
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch (error) {
  console.error(`Configuration error: ${error.message}`);
  process.exitCode = 1;
}
