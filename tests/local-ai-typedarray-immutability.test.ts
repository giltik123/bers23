import assert from 'node:assert/strict';
import test from 'node:test';
import { immutableClone } from '../src/platform/creative/local-ai/immutable.ts';
import { OnnxLocalRuntime } from '../src/platform/creative/local-ai/runtimes/OnnxLocalRuntime.ts';
import type { ModelManifest, TensorValue } from '../src/platform/creative/local-ai/types.ts';

const readyModel: ModelManifest = {
  modelId: 'typed-array-regression',
  version: '1.0.0',
  family: 'test',
  capabilities: ['image-analysis'],
  modelFormat: 'ONNX',
  runtime: 'WASM',
  sizeBytes: 1,
  requiredRam: 1,
  requiredVram: 0,
  supportedPlatforms: ['BROWSER'],
  supportedAccelerators: ['WASM'],
  estimatedLatency: 1,
  qualityScore: 1,
  energyScore: 1,
  privacyLevel: 'PRIVATE',
  license: 'test',
  publisher: 'test',
  downloadUri: 'https://models.example.test/model.onnx',
  sha256: 'a'.repeat(64),
  signature: 'test',
  status: 'READY',
  stabilityScore: 1,
};

test('immutableClone isolates TypedArrays while deeply freezing ordinary containers', () => {
  const source = { data: new Float32Array([1, 2, 3]), metadata: { stable: true } };
  const cloned = immutableClone(source);

  assert.notEqual(cloned, source);
  assert.notEqual(cloned.data, source.data);
  assert.notEqual(cloned.data.buffer, source.data.buffer);
  assert.deepEqual([...cloned.data], [1, 2, 3]);
  assert.equal(Object.isFrozen(cloned), true);
  assert.equal(Object.isFrozen(cloned.metadata), true);
  assert.equal(Object.isFrozen(cloned.data), false, 'TypedArrays are opaque cloned binary leaves');

  source.data[0] = 99;
  assert.equal(cloned.data[0], 1);
});

test('OnnxLocalRuntime clones real tensor views without weakening result immutability', async () => {
  const sessionData = new Float32Array([0.25, 0.75]);
  const sessionOutput: TensorValue = { type: 'float32', dims: [1, 2], data: sessionData };
  const runtime = new OnnxLocalRuntime({
    create: async () => ({ run: async () => ({ output: sessionOutput }) }),
  }, ['wasm'], (() => { let now = 0; return () => now++; })());

  await runtime.load(readyModel, new Uint8Array([1]));
  const result = await runtime.infer({ requestId: 'typed-array', inputs: {} });
  const output = result.outputs.output;

  assert.equal(result.provider, 'wasm');
  assert.ok(output);
  assert.deepEqual([...output.data], [0.25, 0.75]);
  assert.deepEqual(output.dims, [1, 2]);
  assert.equal(result.memoryBytes, 8);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.outputs), true);
  assert.equal(Object.isFrozen(output), true);
  assert.equal(Object.isFrozen(output.dims), true);
  assert.notEqual((output.data as Float32Array).buffer, sessionData.buffer);

  sessionData[0] = 1;
  assert.equal(output.data[0], 0.25);
});
