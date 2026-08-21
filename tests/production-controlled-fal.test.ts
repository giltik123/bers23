import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { createFalWorkflowRuntime, encodeFalMask, type ProviderInputMaterializer } from '../server/core/providers/falWorkflowRuntime.ts';

const scope = { tenantId: 'tenant', userId: 'user', projectId: 'project' };

test('production FAL controlled contract sends only ROI/mask and returns a decoded pixel patch', async () => {
  const outgoing: Array<{ url: string; body?: Record<string, unknown> }> = [];
  const patchBytes = await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 220, g: 30, b: 40, alpha: 1 } } }).png().toBuffer();
  const fetcher: typeof fetch = async (url, init) => {
    const href = String(url);
    if (href === 'https://output.example/patch.png') return new Response(patchBytes, { headers: { 'content-type': 'image/png' } });
    const body = JSON.parse(String(init?.body)); outgoing.push({ url: href, body });
    return new Response(JSON.stringify({ images: [{ url: 'https://output.example/patch.png' }] }), { headers: { 'content-type': 'application/json' } });
  };
  const materialized: string[] = [];
  const materializer: ProviderInputMaterializer = { materialize: async input => { const url = `https://temporary.example/${input.purpose}-${materialized.length}.png`; materialized.push(url); return { url, byteSize: input.bytes.byteLength, width: 2, height: 2 }; } };
  const runtime = createFalWorkflowRuntime({ apiKey: 'not-logged', baseUrl: 'https://queue.fal.test', timeoutMs: 1000, artifacts: { resolve: () => { throw new Error('synthetic ROI must not be resolved'); } } as never, fetcher, materializer });
  const roi = { width: 2, height: 2, data: new Uint8ClampedArray(16).fill(80), format: 'RGBA8', orientation: 1 as const };
  const result = await runtime.execute({ workflowId: 'workflow', scope, operation: { id: 'edit', type: 'CONTROLLED_LOCAL_EDIT', providerId: 'fal', input: { instruction: 'replace object' } }, artifacts: [{ id: 'synthetic-roi', kind: 'image', value: roi, scope, producerStepId: 'edit', metadata: { artifactRole: 'ROI_INPUT', mask: new Uint8Array([0, 255, 0, 255]) } }] });
  assert.equal(outgoing.length, 1); assert.match(outgoing[0].url, /fal-ai\/flux-pro\/v1\/fill/);
  assert.deepEqual(outgoing[0].body, { prompt: 'replace object', image_url: materialized[0], mask_url: materialized[1] });
  const pixelPatch = result.artifacts?.[0].value as typeof roi; assert.deepEqual([pixelPatch.width, pixelPatch.height], [2, 2]); assert.ok(pixelPatch.data instanceof Uint8ClampedArray); assert.equal('url' in pixelPatch, false);
});

test('FAL mask conversion is lossless grayscale PNG with white edit and black preserve', async () => {
  const png = await encodeFalMask(new Uint8Array([0, 255]), 2, 1); const metadata = await sharp(png).metadata(); const decoded = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([metadata.width, metadata.height], [2, 1]); assert.ok(metadata.channels === 1 || metadata.channels === 3); assert.deepEqual([...decoded.data].filter((_value, index) => index % decoded.info.channels === 0), [0, 255]);
});

test('production materializer uses FAL storage initiate/PUT for ROI and mask only', async () => {
  const uploads: Array<{ url: string; bytes: Uint8Array }> = []; let initiates = 0; let providerCalls = 0;
  const patch = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#778899' } }).png().toBuffer();
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('/storage/upload/initiate')) { initiates++; assert.equal(init?.headers && new Headers(init.headers).get('authorization'), 'Key server-secret'); return Response.json({ upload_url: `https://upload.fal.test/${initiates}`, file_url: `https://cdn.fal.test/${initiates}.png` }); }
    if (url.startsWith('https://upload.fal.test/')) { uploads.push({ url, bytes: new Uint8Array(await new Response(init?.body).arrayBuffer()) }); return new Response(null, { status: 200 }); }
    if (url === 'https://output.example/patch.png') return new Response(patch, { headers: { 'content-type': 'image/png' } });
    providerCalls++; assert.deepEqual(JSON.parse(String(init?.body)), { prompt: 'change', image_url: 'https://cdn.fal.test/1.png', mask_url: 'https://cdn.fal.test/2.png' }); return Response.json({ images: [{ url: 'https://output.example/patch.png' }] });
  };
  const runtime = createFalWorkflowRuntime({ apiKey: 'server-secret', baseUrl: 'https://queue.fal.test', timeoutMs: 1000, artifacts: {} as never, fetcher });
  const roi = { width: 2, height: 2, data: new Uint8ClampedArray(16).fill(44), format: 'RGBA8', orientation: 1 as const };
  await runtime.execute({ workflowId: 'actual-materializer', scope, operation: { id: 'edit', type: 'CONTROLLED_LOCAL_EDIT', providerId: 'fal', input: { instruction: 'change' } }, artifacts: [{ id: 'roi-not-original', kind: 'image', value: roi, scope, producerStepId: 'edit', metadata: { artifactRole: 'ROI_INPUT', mask: new Uint8Array([255, 0, 0, 0]) } }] });
  assert.equal(initiates, 2); assert.equal(uploads.length, 2); assert.equal(providerCalls, 1);
  for (const upload of uploads) { const metadata = await sharp(upload.bytes).metadata(); assert.deepEqual([metadata.width, metadata.height], [2, 2]); }
  assert.equal(JSON.stringify(uploads).includes('server-secret'), false);
});

test('production materializer upload failure fails before FAL inference', async () => {
  let providerCalls = 0;
  const fetcher: typeof fetch = async (input) => { const url = String(input); if (url.includes('/storage/upload/initiate')) return Response.json({ upload_url: 'https://upload.fal.test/fail', file_url: 'https://cdn.fal.test/fail.png' }); if (url.startsWith('https://upload.fal.test/')) return new Response(null, { status: 503 }); providerCalls++; return Response.json({}); };
  const runtime = createFalWorkflowRuntime({ apiKey: 'server-secret', baseUrl: 'https://queue.fal.test', timeoutMs: 1000, artifacts: {} as never, fetcher });
  const roi = { width: 1, height: 1, data: new Uint8ClampedArray(4), format: 'RGBA8', orientation: 1 as const };
  await assert.rejects(runtime.execute({ workflowId: 'failed-upload', scope, operation: { id: 'edit', type: 'CONTROLLED_LOCAL_EDIT', providerId: 'fal', input: { instruction: 'change' } }, artifacts: [{ id: 'roi', kind: 'image', value: roi, scope, producerStepId: 'edit', metadata: { artifactRole: 'ROI_INPUT', mask: new Uint8Array([255]) } }] }), /upload failed/);
  assert.equal(providerCalls, 0);
});
