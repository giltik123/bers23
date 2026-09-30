import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { requiredProductionFrontendHeaders } from '../config/frontendSecurityPolicy.mjs';

const MIME_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.onnx': 'application/octet-stream',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
});

export function createFrontendRequestHandler(input = {}) {
  const distDir = resolve(input.distDir ?? process.env.FRONTEND_DIST_DIR?.trim() ?? 'dist');
  const coreApiUrl = input.coreApiUrl ?? process.env.VITE_CORE_API_URL?.trim() ?? '/api/core';
  const securityHeaders = Object.freeze({
    ...requiredProductionFrontendHeaders(coreApiUrl),
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  });

  return (request, response) => {
    for (const [name, value] of Object.entries(securityHeaders)) response.setHeader(name, value);

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.statusCode = 405;
      response.setHeader('Allow', 'GET, HEAD');
      return response.end('Method Not Allowed');
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    } catch {
      response.statusCode = 400;
      return response.end('Bad Request');
    }

    let filePath = resolve(distDir, `.${pathname}`);
    const insideDist = filePath === distDir || filePath.startsWith(`${distDir}${sep}`);
    if (!insideDist) {
      response.statusCode = 400;
      return response.end('Bad Request');
    }

    try {
      if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = join(filePath, 'index.html');
      if (!existsSync(filePath)) {
        if (extname(pathname)) {
          response.statusCode = 404;
          return response.end('Not Found');
        }
        filePath = join(distDir, 'index.html');
      }
      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        response.statusCode = 503;
        return response.end('Frontend artifact unavailable');
      }
    } catch {
      response.statusCode = 500;
      return response.end('Internal Server Error');
    }

    response.statusCode = 200;
    response.setHeader('Content-Type', MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream');
    if (request.method === 'HEAD') return response.end();

    const stream = createReadStream(filePath);
    stream.on('error', () => {
      if (!response.headersSent) response.statusCode = 500;
      response.end();
    });
    stream.pipe(response);
  };
}

export function startFrontendServer(input = {}) {
  const rawPort = input.port ?? process.env.PORT ?? 8080;
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
  const server = createServer(createFrontendRequestHandler(input));
  server.listen(port, '0.0.0.0');
  return server;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (invokedPath === import.meta.url) startFrontendServer();
