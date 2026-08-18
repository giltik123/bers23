import { createServer } from 'node:http';
import { loadCoreServerConfig } from './core/config.ts';
import { createProductionCore } from './core/composition/createProductionCore.ts';
import { createNodeHttpAdapter } from './core/http/nodeHttpAdapter.ts';

export async function startCoreServer() {
  const config = loadCoreServerConfig(); const production = await createProductionCore(config); let accepting = true;
  const ready = async () => { try { await production.transactions.pool.query('SELECT 1'); return true; } catch { return false; } };
  const server = createServer(createNodeHttpAdapter({ core: production.core, auth: production.auth, config, ready, accepting: () => accepting }));
  server.requestTimeout = config.requestTimeoutMs; server.headersTimeout = Math.min(config.requestTimeoutMs, 60_000); server.keepAliveTimeout = 5_000;
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(config.port, resolve); });
  let stopping: Promise<void> | undefined;
  const stop = () => stopping ??= (async () => { accepting = false; await Promise.race([new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())), new Promise<void>(resolve => setTimeout(resolve, config.shutdownTimeoutMs))]); server.closeIdleConnections(); await production.close(); })();
  process.once('SIGTERM', () => { void stop(); }); process.once('SIGINT', () => { void stop(); });
  return Object.freeze({ server, stop, config });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) startCoreServer().catch(() => { process.exitCode = 1; });
