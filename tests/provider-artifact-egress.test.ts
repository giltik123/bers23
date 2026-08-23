import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { FAL_OUTPUT_ARTIFACT_HOSTS } from '../src/platform/creative/composition/CreativeProviderComposition.ts';
import { ProviderArtifactEgressTransport } from '../src/platform/creative/provider-runtime/ProviderArtifactEgressTransport.ts';
import { RuntimeProviderArtifactLoader } from '../src/platform/creative/provider-runtime/index.ts';

const png = new Uint8Array([137, 80, 78, 71]);
const response = (status = 200, headers: Record<string, string> = {}, bytes: Uint8Array = png) => new Response(bytes, { status, headers: { 'content-type': 'image/png', ...headers } });
const policy = Object.freeze({ allowedHosts: FAL_OUTPUT_ARTIFACT_HOSTS, maxRedirects: 4 });

test('FAL output artifact policy is exact, immutable and evidence-bounded', () => {
  assert.deepEqual(FAL_OUTPUT_ARTIFACT_HOSTS, ['fal.media', 'v3.fal.media']);
  assert.equal(Object.isFrozen(FAL_OUTPUT_ARTIFACT_HOSTS), true);
});

test('direct allowlisted FAL output hosts succeed and preserve SHA-256 integrity', async () => {
  for (const host of FAL_OUTPUT_ARTIFACT_HOSTS) {
    const calls: string[] = [];
    const transport = new ProviderArtifactEgressTransport(async (url, init) => { calls.push(url); assert.equal(init.redirect, 'manual'); return response(); }, policy);
    const loaded = await new RuntimeProviderArtifactLoader(transport).load(`https://${host}/files/test/image.png`, { maxBytes: 1024, allowedMimeTypes: ['image/png'] });
    assert.deepEqual(calls, [`https://${host}/files/test/image.png`]);
    assert.equal(loaded.mimeType, 'image/png');
    assert.equal(loaded.size, png.byteLength);
    assert.match(loaded.hash, /^[a-f0-9]{64}$/);
  }
});

test('scheme credentials ports and non-allowlisted destinations fail before network', async () => {
  for (const url of [
    'http://fal.media/files/a.png',
    'https://user:pass@fal.media/files/a.png',
    'https://fal.media:8443/files/a.png',
    'https://localhost/a.png',
    'https://127.0.0.1/a.png',
    'https://[::1]/a.png',
    'https://169.254.169.254/latest/meta-data',
    'https://evil.example/a.png',
    'https://sub.fal.media/a.png',
  ]) {
    let calls = 0;
    const transport = new ProviderArtifactEgressTransport(async () => { calls++; return response(); }, policy);
    await assert.rejects(transport.send({ url, method: 'GET', headers: {}, timeoutMs: 1000 }, new AbortController().signal), /destination is not allowed/);
    assert.equal(calls, 0, url);
  }
});

test('allowlisted redirects are followed manually and every hop is admitted first', async () => {
  const calls: string[] = [];
  const transport = new ProviderArtifactEgressTransport(async url => {
    calls.push(url);
    if (calls.length === 1) return response(302, { location: 'https://v3.fal.media/files/final.png' });
    return response();
  }, policy);
  const loaded = await new RuntimeProviderArtifactLoader(transport).load('https://fal.media/files/start.png', { maxBytes: 1024, allowedMimeTypes: ['image/png'] });
  assert.deepEqual(calls, ['https://fal.media/files/start.png', 'https://v3.fal.media/files/final.png']);
  assert.equal(loaded.url, 'https://fal.media/files/start.png');
});

test('redirect to forbidden destination fails before the forbidden request is sent', async () => {
  for (const location of ['http://fal.media/insecure.png', 'https://localhost/internal', 'https://127.0.0.1/internal', 'https://evil.example/file.png']) {
    const calls: string[] = [];
    const transport = new ProviderArtifactEgressTransport(async url => { calls.push(url); return response(302, { location }); }, policy);
    await assert.rejects(transport.send({ url: 'https://fal.media/files/start.png', method: 'GET', headers: {}, timeoutMs: 1000 }, new AbortController().signal), /destination is not allowed/);
    assert.deepEqual(calls, ['https://fal.media/files/start.png']);
  }
});

test('redirect loops missing locations and redirect exhaustion fail closed', async () => {
  const loopCalls: string[] = [];
  const loop = new ProviderArtifactEgressTransport(async url => {
    loopCalls.push(url);
    return response(302, { location: url.includes('fal.media/files/a') ? 'https://v3.fal.media/files/b' : 'https://fal.media/files/a' });
  }, policy);
  await assert.rejects(loop.send({ url: 'https://fal.media/files/a', method: 'GET', headers: {}, timeoutMs: 1000 }, new AbortController().signal), /redirect loop blocked/);
  assert.equal(loopCalls.length, 2);

  const missing = new ProviderArtifactEgressTransport(async () => response(302), policy);
  await assert.rejects(missing.send({ url: 'https://fal.media/files/a', method: 'GET', headers: {}, timeoutMs: 1000 }, new AbortController().signal), /redirect location is missing/);

  let count = 0;
  const exhausted = new ProviderArtifactEgressTransport(async url => { count++; return response(302, { location: url.includes('fal.media/') ? 'https://v3.fal.media/next' : 'https://fal.media/next' }); }, { allowedHosts: FAL_OUTPUT_ARTIFACT_HOSTS, maxRedirects: 1 });
  await assert.rejects(exhausted.send({ url: 'https://fal.media/start', method: 'GET', headers: {}, timeoutMs: 1000 }, new AbortController().signal), /redirect limit exceeded/);
  assert.equal(count, 2);
});

test('MIME and max-byte protections remain in the canonical artifact loader', async () => {
  const badMime = new ProviderArtifactEgressTransport(async () => response(200, { 'content-type': 'text/html' }), policy);
  await assert.rejects(new RuntimeProviderArtifactLoader(badMime).load('https://fal.media/a', { maxBytes: 100, allowedMimeTypes: ['image/png'] }), /Unsupported artifact MIME/);

  const oversized = new ProviderArtifactEgressTransport(async () => response(200, {}, new Uint8Array(8)), policy);
  await assert.rejects(new RuntimeProviderArtifactLoader(oversized).load('https://fal.media/a', { maxBytes: 4, allowedMimeTypes: ['image/png'] }), /Artifact exceeds size limit/);
});

test('artifact egress transport is GET-only and production composition cannot be widened by user input', async () => {
  const transport = new ProviderArtifactEgressTransport(async () => response(), policy);
  await assert.rejects(transport.send({ url: 'https://fal.media/a', method: 'POST', headers: {}, body: '{}', timeoutMs: 1000 }, new AbortController().signal), /GET-only/);
  const composition = await readFile('src/platform/creative/composition/CreativeProviderComposition.ts', 'utf8');
  assert.equal(composition.includes("['fal.media', 'v3.fal.media']"), true);
  assert.equal(/allowedHosts:\s*(input|request|metadata|env)/.test(composition), false);
});
