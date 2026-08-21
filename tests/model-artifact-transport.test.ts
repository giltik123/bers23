import assert from 'node:assert/strict';
import test from 'node:test';
import { ModelArtifactTransport } from '../src/platform/creative/local-ai/browser/ModelArtifactTransport.ts';

test('browser transport maps only exact signed v1.0.2 identities', async () => {
  let requested = ''; const transport = new ModelArtifactTransport(async input => { requested = String(input); return new Response(new Uint8Array([9])); });
  const signed = 'https://github.com/giltik123/bers23/releases/download/mobilesam-vit-t-v1.0.2/mobilesam-encoder.onnx';
  assert.equal((await transport.fetch(signed)).status, 200);
  assert.equal(requested, '/api/core/models/mobilesam-vit-t/1.0.2/mobilesam-encoder.onnx');
  for (const rejected of [
    'https://example.com/file',
    signed.replace('https:', 'http:'),
    signed.replace('giltik123/bers23', 'other/repo'),
    signed.replace('mobilesam-vit-t-v1.0.2', 'other-tag'),
    'https://localhost/mobilesam-encoder.onnx',
    'file:///mobilesam-encoder.onnx',
    'ftp://github.com/giltik123/bers23/releases/download/mobilesam-vit-t-v1.0.2/mobilesam-encoder.onnx',
    'data:text/plain,model',
  ]) assert.throws(() => transport.relayUrl(rejected), /MODEL_ARTIFACT_URL_NOT_ALLOWED/);
});
