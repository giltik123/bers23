import assert from 'node:assert/strict';
import test from 'node:test';
import manifest from '../src/platform/creative/local-ai/models/efficient-sam-ti.manifest.json';
import { isExecutableEfficientSamRelease } from '../src/platform/creative/local-ai/models/EfficientSamRelease';
import { productionLocalModelsByCapability } from '../server/core/localExecution/productionLocalModelPolicy';
import { productionLocalExecutorsByCapability } from '../server/core/localExecution/productionLocalExecutorPolicy';

const MODEL_ID = 'efficient-sam-ti';

test('EfficientSAM candidate descriptor pins official split ONNX provenance and remains non-executable', () => {
  assert.equal(manifest.status, 'CANDIDATE');
  assert.ok(manifest.artifactState === 'UPSTREAM_PINNED' || manifest.artifactState === 'SIGNED_RELEASE');
  assert.equal(manifest.upstream.revision, 'd525f622e6f640acf5a0fc37c7ca1f243da5bde0');
  assert.equal(manifest.upstream.license, 'Apache-2.0');
  assert.deepEqual(manifest.upstream.artifacts.encoder, {
    path: 'weights/efficient_sam_vitt_encoder.onnx',
    gitBlob: '6458f72477ae216a1bd68db41ffa14802c8d54f1',
    size: 24799761,
  });
  assert.deepEqual(manifest.upstream.artifacts.decoder, {
    path: 'weights/efficient_sam_vitt_decoder.onnx',
    gitBlob: 'f9310202c916fe5a4ec9a6897edae855caf023f4',
    size: 16565728,
  });
  if (manifest.artifactState === 'UPSTREAM_PINNED') {
    assert.equal(manifest.artifacts.encoder.url, null);
    assert.equal(manifest.artifacts.decoder.url, null);
    assert.equal(manifest.verificationKeyId, null);
  } else {
    for (const artifact of [manifest.artifacts.encoder, manifest.artifacts.decoder]) {
      assert.equal(typeof artifact.url, 'string');
      assert.equal(typeof artifact.size, 'number');
      assert.equal(typeof artifact.sha256, 'string');
      assert.equal(typeof artifact.signatureUrl, 'string');
    }
    assert.equal(typeof manifest.verificationKeyId, 'string');
  }
  assert.equal(manifest.productionApprovalEvidence, null);
  assert.equal(isExecutableEfficientSamRelease(manifest), false);
});

test('status flag alone cannot promote an unsigned EfficientSAM release', () => {
  const forged = structuredClone(manifest) as any;
  forged.status = 'PRODUCTION_APPROVED';
  forged.artifactState = 'UPSTREAM_PINNED';
  forged.artifacts = {
    encoder: { url: null, size: null, sha256: null, signatureUrl: null },
    decoder: { url: null, size: null, sha256: null, signatureUrl: null },
  };
  forged.verificationKeyId = null;
  forged.productionApprovalEvidence = null;
  assert.equal(isExecutableEfficientSamRelease(forged), false);
});

test('release predicate requires exact model identity and a complete signed two-artifact envelope', () => {
  const artifact = Object.freeze({
    url: 'https://github.com/giltik123/bers23/releases/download/efficient-sam-ti-v1/encoder.onnx',
    size: 1,
    sha256: 'a'.repeat(64),
    signatureUrl: 'https://github.com/giltik123/bers23/releases/download/efficient-sam-ti-v1/encoder.onnx.sig',
  });
  const complete = {
    ...manifest,
    status: 'PRODUCTION_APPROVED',
    artifactState: 'SIGNED_RELEASE',
    verificationKeyId: 'bers-interactive-segmentation-release-2026-08',
    productionApprovalEvidence: 'https://github.com/giltik123/bers23/issues/999',
    artifacts: { encoder: artifact, decoder: { ...artifact, url: artifact.url.replace('encoder', 'decoder'), signatureUrl: artifact.signatureUrl.replace('encoder', 'decoder') } },
  };
  assert.equal(isExecutableEfficientSamRelease(complete), true);
  assert.equal(isExecutableEfficientSamRelease({ ...complete, modelId: 'forged-model' }), false);
  assert.equal(isExecutableEfficientSamRelease({ ...complete, artifacts: { ...complete.artifacts, decoder: { ...complete.artifacts.decoder, sha256: 'bad' } } }), false);
  assert.equal(isExecutableEfficientSamRelease({ ...complete, productionApprovalEvidence: 'http://example.com/evidence' }), false);
});

test('EfficientSAM candidate is absent from both legacy v1 and production v2 executable catalogs', () => {
  for (const models of Object.values(productionLocalModelsByCapability)) {
    assert.equal(models.some(model => model.modelId === MODEL_ID), false);
  }
  for (const executors of Object.values(productionLocalExecutorsByCapability)) {
    assert.equal(executors.some(executor => executor.kind === 'MODEL' && executor.modelId === MODEL_ID), false);
  }
});
