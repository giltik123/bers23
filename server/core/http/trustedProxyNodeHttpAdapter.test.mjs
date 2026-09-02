import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createNodeHttpAdapter } from './nodeHttpAdapter.ts';

const baseConfig = Object.freeze({
  nodeEnv: 'test',
  allowApiBearerAuth: true,
  allowedWebOrigins: Object.freeze(['http://app.test']),
  authChallengeSecret: 'trusted-proxy-http-test-secret',
  authPublicOrigin: 'http://localhost',
  bodyLimitBytes: 16_384,
  trustedProxyHeaderMode: 'NONE',
  trustedProxyCidrs: Object.freeze([]),
});

async function captureRegisterRisk(config, headers = {}) {
  const risks = [];
  const adapter = createNodeHttpAdapter({
    core: {},
    artifacts: {},
    projects: {},
    auth: {
      verify: async () => ({ tenantId: 'unused', userId: 'unused' }),
      register: async (_email, _password, _displayName, risk) => {
        risks.push(risk);
        return Object.freeze({ accepted: true });
      },
    },
    config,
    ready: async () => true,
    accepting: () => true,
  });
  const server = createServer((request, response) => { void adapter(request, response); });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test server address unavailable');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/core/auth/register`, {
      method: 'POST',
      headers: {
        Origin: 'http://app.test',
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({ email: 'risk@example.test', password: 'not-a-real-password' }),
    });
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { accepted: true });
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  assert.equal(risks.length, 1);
  return risks[0];
}

test('Node auth transport ignores XFF by default', async () => {
  const risk = await captureRegisterRisk(baseConfig, { 'X-Forwarded-For': '198.51.100.7' });
  assert.equal(risk.peerAddress, '127.0.0.1');
});

test('Node auth transport ignores spoofed XFF when the immediate socket peer is not trusted', async () => {
  const risk = await captureRegisterRisk({
    ...baseConfig,
    trustedProxyHeaderMode: 'X_FORWARDED_FOR',
    trustedProxyCidrs: Object.freeze(['10.0.0.0/8']),
  }, { 'X-Forwarded-For': '198.51.100.7' });
  assert.equal(risk.peerAddress, '127.0.0.1');
});

test('Node auth transport accepts XFF only from an explicitly trusted immediate proxy CIDR', async () => {
  const risk = await captureRegisterRisk({
    ...baseConfig,
    trustedProxyHeaderMode: 'X_FORWARDED_FOR',
    trustedProxyCidrs: Object.freeze(['127.0.0.0/8']),
  }, { 'X-Forwarded-For': '198.51.100.7' });
  assert.equal(risk.peerAddress, '198.51.100.7');
});

test('malformed XFF from a trusted proxy fails closed to the socket peer', async () => {
  const risk = await captureRegisterRisk({
    ...baseConfig,
    trustedProxyHeaderMode: 'X_FORWARDED_FOR',
    trustedProxyCidrs: Object.freeze(['127.0.0.0/8']),
  }, { 'X-Forwarded-For': '198.51.100.7:443' });
  assert.equal(risk.peerAddress, '127.0.0.1');
});
