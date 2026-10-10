import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requiredProductionFrontendHeaders } from '../config/frontendSecurityPolicy.mjs';
import { createCoreApiProxy } from './production-core-api-proxy.mjs';

const DEFAULT_PORT = 8080;
const ONE_YEAR_SECONDS = 31_536_000;
const EXACT_SHA_RE = /^[0-9a-f]{40}$/u;
const MIME_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.onnx': 'application/octet-stream',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
});

export function createProductionFrontendServer(input = {}) {
  const rootDir = resolve(input.rootDir ?? process.env.FRONTEND_DIST_DIR ?? 'dist');
  const coreApiUrl = input.coreApiUrl ?? process.env.VITE_CORE_API_URL ?? '/api/core';
  const coreProxy = createCoreApiProxy(input.coreUpstreamUrl ?? process.env.CORE_API_URL);
  const deploymentSha = normalizeDeploymentSha(input.deploymentSha ?? process.env.RAILWAY_GIT_COMMIT_SHA);
  const requiredHeaders = requiredProductionFrontendHeaders(coreApiUrl);

  return createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://frontend.invalid').pathname);
    } catch {
      response.statusCode = 400;
      response.end('Bad Request');
      return;
    }

    // The browser now talks to its own origin, so the __Host- session cookie
    // remains first-party and Strict. Never serve SPA HTML for a missing API.
    if (pathname === '/api/core' || pathname.startsWith('/api/core/')) {
      coreProxy(request, response);
      return;
    }

    const requestedPath = resolve(rootDir, `.${pathname}`);
    const relativePath = relative(rootDir, requestedPath);
    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      response.statusCode = 400;
      response.end('Bad Request');
      return;
    }

    let filePath = requestedPath;
    if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = resolve(filePath, 'index.html');
    if (!existsSync(filePath) || !statSync(filePath).isFile()) filePath = resolve(rootDir, 'index.html');

    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      response.statusCode = 503;
      response.end('Frontend build unavailable');
      return;
    }

    response.statusCode = 200;
    for (const [name, value] of Object.entries(requiredHeaders)) response.setHeader(name, value);
    response.setHeader('Strict-Transport-Security', `max-age=${ONE_YEAR_SECONDS}; includeSubDomains`);
    if (deploymentSha) response.setHeader('X-BERS-Deployment-SHA', deploymentSha);
    response.setHeader('Content-Type', MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream');

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    createReadStream(filePath)
      .once('error', () => {
        if (!response.headersSent) response.statusCode = 500;
        response.end();
      })
      .pipe(response);
  });
}

function normalizeDeploymentSha(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (!EXACT_SHA_RE.test(normalized)) throw new Error('RAILWAY_GIT_COMMIT_SHA must be one exact 40-character Git SHA when provided');
  return normalized;
}

export async function startProductionFrontendServer(input = {}) {
  const port = Number(input.port ?? process.env.PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PORT must be an integer between 1 and 65535');

  const host = input.host ?? '0.0.0.0';
  const server = createProductionFrontendServer(input);
  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(port, host, resolvePromise);
  });
  return server;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  startProductionFrontendServer().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
