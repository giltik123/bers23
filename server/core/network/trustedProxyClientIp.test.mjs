import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileTrustedProxyClientIpPolicy,
  resolveTransportClientIp,
} from './trustedProxyClientIp.ts';

const none = () => compileTrustedProxyClientIpPolicy({ headerMode: 'NONE', trustedCidrs: [] });
const xff = (trustedCidrs = ['10.0.0.0/8']) => compileTrustedProxyClientIpPolicy({
  headerMode: 'X_FORWARDED_FOR',
  trustedCidrs,
});

test('trusted proxy policy defaults to socket identity and never trusts forwarding headers implicitly', () => {
  const resolved = resolveTransportClientIp({
    remoteAddress: '203.0.113.10',
    xForwardedFor: '198.51.100.7',
  }, none());
  assert.deepEqual(resolved, {
    socketPeerAddress: '203.0.113.10',
    clientAddress: '203.0.113.10',
    source: 'SOCKET',
    forwardedAccepted: false,
  });
});

test('spoofed X-Forwarded-For from an untrusted immediate peer is ignored', () => {
  const resolved = resolveTransportClientIp({
    remoteAddress: '203.0.113.10',
    xForwardedFor: '1.2.3.4',
  }, xff());
  assert.equal(resolved.clientAddress, '203.0.113.10');
  assert.equal(resolved.source, 'SOCKET');
  assert.equal(resolved.forwardedAccepted, false);
});

test('one trusted proxy may establish one literal client address', () => {
  const resolved = resolveTransportClientIp({
    remoteAddress: '10.1.2.3',
    xForwardedFor: '198.51.100.7',
  }, xff());
  assert.deepEqual(resolved, {
    socketPeerAddress: '10.1.2.3',
    clientAddress: '198.51.100.7',
    source: 'TRUSTED_X_FORWARDED_FOR',
    forwardedAccepted: true,
  });
});

test('trusted proxy chain walks right-to-left and stops at the first untrusted hop', () => {
  const policy = xff(['10.0.0.0/8', '192.0.2.0/24']);
  const resolved = resolveTransportClientIp({
    remoteAddress: '10.1.2.3',
    xForwardedFor: '198.51.100.200, 203.0.113.44, 192.0.2.9',
  }, policy);
  assert.equal(resolved.clientAddress, '203.0.113.44');
  assert.equal(resolved.forwardedAccepted, true);
});

test('multiple declared trusted proxies resolve the original untrusted client', () => {
  const policy = xff(['10.0.0.0/8', '192.0.2.0/24']);
  const resolved = resolveTransportClientIp({
    remoteAddress: '10.1.2.3',
    xForwardedFor: '198.51.100.7, 192.0.2.9',
  }, policy);
  assert.equal(resolved.clientAddress, '198.51.100.7');
});

test('IPv4-mapped socket peers normalize before trusted-CIDR evaluation', () => {
  const resolved = resolveTransportClientIp({
    remoteAddress: '::ffff:10.1.2.3',
    xForwardedFor: '198.51.100.7',
  }, xff());
  assert.equal(resolved.socketPeerAddress, '10.1.2.3');
  assert.equal(resolved.clientAddress, '198.51.100.7');
  assert.equal(resolved.forwardedAccepted, true);
});

test('trusted IPv6 immediate proxy resolves a literal IPv6 client', () => {
  const policy = xff(['2001:db8:1234::/48']);
  const resolved = resolveTransportClientIp({
    remoteAddress: '2001:db8:1234::10',
    xForwardedFor: '2001:4860:4860::8888',
  }, policy);
  assert.equal(resolved.socketPeerAddress, '2001:db8:1234::10');
  assert.equal(resolved.clientAddress, '2001:4860:4860::8888');
  assert.equal(resolved.forwardedAccepted, true);
});

test('malformed, port-bearing, empty and oversized XFF chains fail closed to the socket peer', () => {
  const policy = xff();
  const invalid = [
    'unknown',
    '198.51.100.7:443',
    '198.51.100.7,',
    '198.51.100.7,,203.0.113.8',
    Array.from({ length: 33 }, (_, index) => `198.51.100.${(index % 200) + 1}`).join(','),
    '1'.repeat(4_097),
  ];
  for (const header of invalid) {
    const resolved = resolveTransportClientIp({ remoteAddress: '10.1.2.3', xForwardedFor: header }, policy);
    assert.equal(resolved.clientAddress, '10.1.2.3', header.slice(0, 80));
    assert.equal(resolved.source, 'SOCKET');
    assert.equal(resolved.forwardedAccepted, false);
  }
});

test('an unusual socket peer label remains the fallback identity but can never activate proxy trust', () => {
  const resolved = resolveTransportClientIp({
    remoteAddress: 'unexpected-peer-label',
    xForwardedFor: '198.51.100.7',
  }, xff());
  assert.equal(resolved.clientAddress, 'unexpected-peer-label');
  assert.equal(resolved.source, 'SOCKET');
});

test('trusted proxy configuration is explicit and rejects ambiguous or invalid deployment policy', () => {
  assert.throws(() => compileTrustedProxyClientIpPolicy({ headerMode: 'NONE', trustedCidrs: ['10.0.0.0/8'] }), /require X_FORWARDED_FOR/i);
  assert.throws(() => compileTrustedProxyClientIpPolicy({ headerMode: 'X_FORWARDED_FOR', trustedCidrs: [] }), /requires at least one/i);
  assert.throws(() => compileTrustedProxyClientIpPolicy({ headerMode: 'FORWARDED', trustedCidrs: ['10.0.0.0/8'] }), /header mode/i);
  assert.throws(() => compileTrustedProxyClientIpPolicy({ headerMode: 'X_FORWARDED_FOR', trustedCidrs: ['proxy.internal'] }), /CIDR 0/i);
  assert.throws(() => compileTrustedProxyClientIpPolicy({ headerMode: 'X_FORWARDED_FOR', trustedCidrs: ['10.0.0.0/33'] }), /prefix/i);
  assert.throws(() => compileTrustedProxyClientIpPolicy({ headerMode: 'X_FORWARDED_FOR', trustedCidrs: ['2001:db8::/129'] }), /prefix/i);
});
