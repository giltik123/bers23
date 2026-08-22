import type { ServerResponse } from 'node:http';
import type { CoreServerConfig } from '../config.ts';

export const CORE_API_CSP = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";

/**
 * Defense-in-depth response headers owned by the production Core boundary.
 * These headers are deliberately independent of route success/failure so auth,
 * redirects, artifact delivery and structured errors all receive the same
 * baseline browser protections.
 */
export function applyCoreSecurityHeaders(response: ServerResponse, config: CoreServerConfig): void {
  response.setHeader('Content-Security-Policy', CORE_API_CSP);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Origin-Agent-Cluster', '?1');
  response.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  response.setHeader('Permissions-Policy', 'camera=(), geolocation=(), payment=(), usb=()');

  if (securePublicOrigin(config.authPublicOrigin)) {
    response.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
}

function securePublicOrigin(value: string): boolean {
  try { return new URL(value).protocol === 'https:'; }
  catch { return false; }
}
