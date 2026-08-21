import assert from 'node:assert/strict';
import test from 'node:test';
import { modelArtifactRelay } from './modelArtifactRelay.ts';

const base = 'http://core.test/api/core/models/mobilesam-vit-t/1.0.2/';

test('relay exposes only fixed immutable artifact names and preserves bytes', async () => {
  const expected = new Uint8Array([0, 255, 31, 139, 7]); let upstreamUrl;
  const response = await modelArtifactRelay(new Request(`${base}mobilesam-encoder.onnx`), async (url, init) => {
    upstreamUrl = url; assert.equal(init.redirect, 'follow'); return new Response(expected, { status: 200 });
  });
  assert.equal(upstreamUrl, 'https://github.com/giltik123/bers23/releases/download/mobilesam-vit-t-v1.0.2/mobilesam-encoder.onnx');
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'application/octet-stream');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), expected);
});

test('relay cannot be controlled into an SSRF destination', async () => {
  const attacks = [
    `${base}?url=https://example.com/file`,
    `${base}https:%2F%2Fexample.com%2Ffile`,
    `${base}mobilesam-encoder.onnx?url=http://127.0.0.1`,
    `${base}../other-tag/mobilesam-encoder.onnx`,
    `${base}mobilesam-encoder.onnx/localhost`,
  ];
  for (const url of attacks) {
    let called = false; const response = await modelArtifactRelay(new Request(url), async () => { called = true; return new Response(); });
    assert.ok(response === undefined || response.status === 404, url); assert.equal(called, false, url);
  }
});

test('relay converts upstream failures to controlled errors', async () => {
  const badStatus = await modelArtifactRelay(new Request(`${base}mobilesam-decoder.onnx.sig`), async () => new Response('private detail', { status: 404 }));
  assert.equal(badStatus.status, 502); assert.doesNotMatch(await badStatus.text(), /private detail/);
  const unavailable = await modelArtifactRelay(new Request(`${base}mobilesam-decoder.onnx`), async () => { throw new Error('secret stack'); });
  assert.equal(unavailable.status, 503); assert.doesNotMatch(await unavailable.text(), /secret stack/);
});
