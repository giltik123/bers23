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
