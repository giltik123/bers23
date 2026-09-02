import { BlockList, isIP } from 'node:net';

export type TrustedProxyHeaderMode = 'NONE' | 'X_FORWARDED_FOR';

export type TrustedProxyClientIpPolicy = Readonly<{
  headerMode: TrustedProxyHeaderMode;
  trustedCidrs: readonly string[];
}>;

export type TransportClientIpInput = Readonly<{
  remoteAddress?: string;
  xForwardedFor?: string;
}>;

export type ResolvedTransportClientIp = Readonly<{
  socketPeerAddress?: string;
  clientAddress?: string;
  source: 'SOCKET' | 'TRUSTED_X_FORWARDED_FOR';
  forwardedAccepted: boolean;
}>;

export type CompiledTrustedProxyClientIpPolicy = Readonly<{
  headerMode: TrustedProxyHeaderMode;
  trustedCidrs: readonly string[];
  trusted: BlockList;
}>;

const MAX_TRUSTED_CIDRS = 128;
const MAX_X_FORWARDED_FOR_BYTES = 4_096;
const MAX_X_FORWARDED_FOR_HOPS = 32;

/**
 * Compile the deployment-owned immediate-proxy trust boundary once at startup.
 *
 * NONE is the safe default and requires an empty CIDR list. XFF is accepted only
 * when at least one concrete proxy subnet is explicitly trusted. Hostnames,
 * wildcards and implicit private-network trust are intentionally unsupported.
 */
export function compileTrustedProxyClientIpPolicy(
  policy: TrustedProxyClientIpPolicy,
): CompiledTrustedProxyClientIpPolicy {
  if (!policy || typeof policy !== 'object') throw new Error('Trusted proxy policy is required');
  if (policy.headerMode !== 'NONE' && policy.headerMode !== 'X_FORWARDED_FOR') {
    throw new Error('Trusted proxy header mode is invalid');
  }
  if (!Array.isArray(policy.trustedCidrs)) throw new Error('Trusted proxy CIDRs must be an array');
  if (policy.trustedCidrs.length > MAX_TRUSTED_CIDRS) throw new Error(`Trusted proxy CIDRs exceed ${MAX_TRUSTED_CIDRS} entries`);

  const trustedCidrs = Object.freeze(policy.trustedCidrs.map((value, index) => normalizeCidr(value, index)));
  if (policy.headerMode === 'NONE' && trustedCidrs.length !== 0) {
    throw new Error('Trusted proxy CIDRs require X_FORWARDED_FOR mode');
  }
  if (policy.headerMode === 'X_FORWARDED_FOR' && trustedCidrs.length === 0) {
    throw new Error('X_FORWARDED_FOR mode requires at least one trusted proxy CIDR');
  }

  const trusted = new BlockList();
  for (const cidr of trustedCidrs) {
    const [address, rawPrefix] = cidr.split('/');
    const family = isIP(address);
    trusted.addSubnet(address, Number(rawPrefix), family === 4 ? 'ipv4' : 'ipv6');
  }
  return Object.freeze({ headerMode: policy.headerMode, trustedCidrs, trusted });
}

/**
 * Resolve the effective transport client without granting browser/header authority.
 *
 * Starting at the TCP peer, walk X-Forwarded-For from right to left only while
 * the current hop belongs to an explicitly trusted proxy CIDR. The first
 * untrusted hop becomes the effective client. An untrusted immediate peer,
 * malformed/oversized chain, missing header or disabled policy always falls back
 * to the socket peer.
 */
export function resolveTransportClientIp(
  input: TransportClientIpInput,
  policy: CompiledTrustedProxyClientIpPolicy,
): ResolvedTransportClientIp {
  const rawSocketPeerAddress = socketPeerText(input.remoteAddress);
  const normalizedSocketPeerAddress = normalizeIp(rawSocketPeerAddress);
  const socketPeerAddress = normalizedSocketPeerAddress ?? rawSocketPeerAddress;
  if (
    !normalizedSocketPeerAddress
    || policy.headerMode === 'NONE'
    || !isTrusted(normalizedSocketPeerAddress, policy.trusted)
  ) return socketResult(socketPeerAddress);

  if (typeof input.xForwardedFor !== 'string' || !input.xForwardedFor.trim()) {
    return socketResult(socketPeerAddress);
  }

  let chain: readonly string[];
  try {
    chain = parseXForwardedFor(input.xForwardedFor);
  } catch {
    return socketResult(socketPeerAddress);
  }

  let current = normalizedSocketPeerAddress;
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    if (!isTrusted(current, policy.trusted)) break;
    current = chain[index];
  }
  return Object.freeze({
    socketPeerAddress,
    clientAddress: current,
    source: 'TRUSTED_X_FORWARDED_FOR',
    forwardedAccepted: true,
  });
}

function parseXForwardedFor(value: string): readonly string[] {
  if (Buffer.byteLength(value, 'utf8') > MAX_X_FORWARDED_FOR_BYTES) {
    throw new Error('X-Forwarded-For exceeds the trusted transport limit');
  }
  const tokens = value.split(',').map(part => part.trim());
  if (
    tokens.length < 1
    || tokens.length > MAX_X_FORWARDED_FOR_HOPS
    || tokens.some(token => !token)
  ) throw new Error('X-Forwarded-For chain shape is invalid');

  return Object.freeze(tokens.map((token, index) => {
    const address = normalizeIp(token);
    if (!address) throw new Error(`X-Forwarded-For hop ${index} is not a literal IP address`);
    return address;
  }));
}

function socketPeerText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeIp(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  // Node commonly exposes IPv4 TCP peers as IPv4-mapped IPv6. Normalize only
  // the canonical mapped-literal form so IPv4 CIDRs work consistently.
  const mapped = /^::ffff:([0-9]{1,3}(?:\.[0-9]{1,3}){3})$/i.exec(trimmed);
  const candidate = mapped ? mapped[1] : trimmed;
  return isIP(candidate) ? candidate.toLowerCase() : undefined;
}

function normalizeCidr(value: unknown, index: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Trusted proxy CIDR ${index} is invalid`);
  const raw = value.trim();
  const parts = raw.split('/');
  if (parts.length > 2) throw new Error(`Trusted proxy CIDR ${index} is invalid`);
  const address = normalizeIp(parts[0]);
  if (!address) throw new Error(`Trusted proxy CIDR ${index} is invalid`);
  const family = isIP(address);
  const maxPrefix = family === 4 ? 32 : 128;
  const rawPrefix = parts[1] ?? String(maxPrefix);
  if (!/^(0|[1-9][0-9]{0,2})$/.test(rawPrefix)) throw new Error(`Trusted proxy CIDR ${index} prefix is invalid`);
  const prefix = Number(rawPrefix);
  if (prefix < 0 || prefix > maxPrefix) throw new Error(`Trusted proxy CIDR ${index} prefix is invalid`);
  return `${address}/${prefix}`;
}

function isTrusted(address: string, trusted: BlockList): boolean {
  const family = isIP(address);
  return family !== 0 && trusted.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

function socketResult(socketPeerAddress?: string): ResolvedTransportClientIp {
  return Object.freeze({
    socketPeerAddress,
    clientAddress: socketPeerAddress,
    source: 'SOCKET',
    forwardedAccepted: false,
  });
}
