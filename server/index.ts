import { createServer, type ServerResponse } from 'node:http';
import { loadCoreServerConfig } from './core/config.ts';
import { createProductionCore } from './core/composition/createProductionCore.ts';
import { createLocalExecutionHttpAdapter } from './core/http/localExecutionHttpAdapter.ts';
import { createOrthogonalTransformHttpAdapter } from './core/http/orthogonalTransformHttpAdapter.ts';
import { createLocalCompositeContinuationHttpAdapter } from './core/http/localCompositeContinuationHttpAdapter.ts';
import { createManagedGarmentHttpAdapter } from './core/http/managedGarmentHttpAdapter.ts';
import { parseCoreRequestTarget } from './core/http/requestTarget.ts';
import { LocalCompositeOutputUploadService } from './core/workflow/LocalCompositeOutputUploadService.ts';
import { createCanonicalNodeHttpAdapter } from './core/http/canonicalNodeHttpAdapter.ts';
import { applyCoreSecurityHeaders } from './core/http/securityHeaders.ts';
import { checkGarmentSchema, migrateGarmentSchema } from './core/fashion/garmentSchema.ts';
import { PostgresGarmentStore } from './core/fashion/postgresGarmentStore.ts';
import { GarmentDeliveryAuthority } from './core/fashion/garmentDeliveryAuthority.ts';

export async function startCoreServer() {
  const config = loadCoreServerConfig(); const production = await createProductionCore(config); let accepting = true;
  try {
    if (config.nodeEnv === 'test') await migrateGarmentSchema(production.transactions.pool);
    else await checkGarmentSchema(production.transactions.pool);
  } catch (error) { await production.close(); throw error; }
  const ready = async () => { try { await production.transactions.pool.query('SELECT 1'); await checkGarmentSchema(production.transactions.pool); return true; } catch { return false; } };
  const adapter = createCanonicalNodeHttpAdapter({ core: production.core, artifacts: production.artifacts, projects: production.projects, auth: production.auth, config, ready, accepting: () => accepting });
  const garments = new PostgresGarmentStore(production.transactions.pool);
  const garmentDelivery = new GarmentDeliveryAuthority(config.artifactSigningSecret);
  const managedGarmentAdapter = createManagedGarmentHttpAdapter({ garments, delivery: garmentDelivery, auth: production.auth, config, accepting: () => accepting });
  const orthogonalTransformAdapter = createOrthogonalTransformHttpAdapter({ service: production.localExecution.orthogonalTransform, inputDelivery: production.localExecution.orthogonalTransformInputDelivery, auth: production.auth, config });
  const localExecutionAdapter = createLocalExecutionHttpAdapter({ service: production.localExecution.segmentation, deterministicImages: production.localExecution.deterministicImages, crop: production.localExecution.crop, resize: production.localExecution.resize, superResolution: production.localExecution.superResolution, inputDelivery: production.localExecution.inputDelivery, auth: production.auth, config });
  const localCompositeOutputs = new LocalCompositeOutputUploadService({ continuation: production.localExecution.composite, uploads: production.localExecution.uploads });
  const localCompositeAdapter = createLocalCompositeContinuationHttpAdapter({ continuation: production.localExecution.composite, outputs: localCompositeOutputs, auth: production.auth, config });
  const server = createServer((request, response) => {
    applyCoreSecurityHeaders(response, config);
    const target = parseCoreRequestTarget(request.url);
    if (target.ok === false) { sendInvalidRequestTarget(response, target); return; }
    const path = target.path;
    if (path === '/api/core/garments' || path.startsWith('/api/core/garments/')) return void managedGarmentAdapter(request, response);
    if ((request.url ?? '').startsWith('/api/core/local-execution/orthogonal-transform/')) return void orthogonalTransformAdapter(request, response);
    if ((request.url ?? '').startsWith('/api/core/local-execution/')) return void localExecutionAdapter(request, response);
    if ((request.url ?? '').startsWith('/api/core/composite-continuations/')) return void localCompositeAdapter(request, response);
    return adapter(request, response);
  });
  server.requestTimeout = config.requestTimeoutMs; server.headersTimeout = Math.min(config.requestTimeoutMs, 60_000); server.keepAliveTimeout = 5_000;
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(config.port, resolve); });
  let stopping: Promise<void> | undefined;
  const stop = () => stopping ??= (async () => { accepting = false; await Promise.race([new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())), new Promise<void>(resolve => setTimeout(resolve, config.shutdownTimeoutMs))]); server.closeIdleConnections(); await production.close(); })();
  process.once('SIGTERM', () => { void stop(); }); process.once('SIGINT', () => { void stop(); });
  return Object.freeze({ server, stop, config });
}

function sendInvalidRequestTarget(response: ServerResponse, error: Readonly<{ status: 400; code: string; message: string }>): void {
  const bytes = Buffer.from(JSON.stringify({ error: error.code, message: error.message }));
  response.statusCode = error.status;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Content-Length', bytes.byteLength);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(bytes);
}

function startupFailure(error: unknown): Readonly<{ event: 'core_startup_failed'; name: string; code?: string; message: string }> {
  const candidate = error && typeof error === 'object' ? error as { name?: unknown; code?: unknown; message?: unknown } : undefined;
  const name = typeof candidate?.name === 'string' && candidate.name ? candidate.name.slice(0, 80) : 'Error';
  const code = typeof candidate?.code === 'string' && /^[A-Za-z0-9_.:-]{1,100}$/.test(candidate.code) ? candidate.code : undefined;
  const rawMessage = typeof candidate?.message === 'string' && candidate.message ? candidate.message : 'Core startup failed';
  return Object.freeze({ event: 'core_startup_failed', name, ...(code ? { code } : {}), message: sanitizeStartupMessage(rawMessage) });
}

function sanitizeStartupMessage(message: string): string {
  let sanitized = message.slice(0, 1000)
    .replace(/([a-z][a-z0-9+.-]*:\/\/)([^\s/@:]+):([^\s/@]+)@/gi, '$1[redacted]@');
  for (const name of ['DATABASE_URL','FAL_KEY','JWT_SECRET','AUTH_CHALLENGE_SECRET','RESEND_API_KEY','GOOGLE_OAUTH_CLIENT_SECRET','ARTIFACT_SIGNING_SECRET']) {
    const secret = process.env[name];
    if (secret && secret.length >= 4) sanitized = sanitized.split(secret).join('[redacted]');
  }
  return sanitized.replace(/[\r\n\t]+/g, ' ').trim() || 'Core startup failed';
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) startCoreServer().catch((error) => {
  console.error(JSON.stringify(startupFailure(error)));
  process.exitCode = 1;
});