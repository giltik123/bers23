import assert from 'node:assert/strict';
import test from 'node:test';
import manifest from '../src/platform/creative/local-ai/models/super-resolution.manifest.json' with { type: 'json' };
import {
  REAL_ESRGAN_LOCAL_CAPABILITY,
  isExecutableRealEsrganRelease,
  productionLocalModelsByCapability,
  realEsrganProductionReleaseState,
} from '../server/core/localExecution/productionLocalModelPolicy.ts';

test('Real-ESRGAN candidate descriptor records pinned provenance but has no executable artifact', () => {
  assert.equal(manifest.modelId, 'realesr-general-x4v3');
  assert.equal(manifest.status, 'CANDIDATE');
  assert.equal(manifest.artifactState, 'EXPORT_REQUIRED');
  assert.equal(manifest.capability, REAL_ESRGAN_LOCAL_CAPABILITY);
  assert.equal(manifest.upstream.checkpointSize, 4_885_111);
  assert.equal(manifest.upstream.checkpointSha256, '8dc7edb9ac80ccdc30c3a5dca6616509367f05fbc184ad95b731f05bece96292');
  assert.equal(manifest.upstream.implementationRevision, 'fa4c8a03ae3dbc9ea6ed471a6ab5da94ac15c2ea');
  assert.equal(manifest.export.alphaPolicy, 'OPAQUE_INPUT_ONLY');
  assert.equal(manifest.export.output.networkRange, 'UNCLAMPED_FLOAT32');
  assert.equal(manifest.export.output.postprocess, 'CLAMP_0_1');
  assert.equal(manifest.artifacts.model.url, null);
  assert.equal(manifest.artifacts.model.sha256, null);
  assert.equal(manifest.artifacts.model.signatureUrl, null);
  assert.equal(isExecutableRealEsrganRelease(manifest), false);
  assert.deepEqual(productionLocalModelsByCapability[REAL_ESRGAN_LOCAL_CAPABILITY], []);
  assert.deepEqual(realEsrganProductionReleaseState, {
    modelId: 'realesr-general-x4v3',
    version: '1.0.0-candidate.1',
    releaseStatus: 'CANDIDATE',
    artifactState: 'EXPORT_REQUIRED',
    executable: false,
  });
});

test('status flag alone cannot promote an incomplete Real-ESRGAN release', () => {
  const statusOnly = structuredClone(manifest) as any;
  statusOnly.status = 'PRODUCTION_APPROVED';
  assert.equal(isExecutableRealEsrganRelease(statusOnly), false);

  statusOnly.artifactState = 'SIGNED_RELEASE';
  statusOnly.verificationKeyId = 'bers-local-model-release-2026';
  statusOnly.productionApprovalEvidence = 'https://github.com/giltik123/bers23/issues/999';
  assert.equal(isExecutableRealEsrganRelease(statusOnly), false, 'missing artifact bytes/evidence must remain blocked');
});

test('release predicate requires a complete HTTPS signed-artifact envelope and approval evidence', () => {
  const approved = structuredClone(manifest) as any;
  approved.status = 'PRODUCTION_APPROVED';
  approved.artifactState = 'SIGNED_RELEASE';
  approved.verificationKeyId = 'bers-local-model-release-2026';
  approved.productionApprovalEvidence = 'https://github.com/giltik123/bers23/issues/999';
  approved.artifacts.model = {
    url: 'https://github.com/giltik123/bers23/releases/download/realesr-general-x4v3-v1/model.onnx',
    size: 4_800_000,
    sha256: 'a'.repeat(64),
    signatureUrl: 'https://github.com/giltik123/bers23/releases/download/realesr-general-x4v3-v1/model.onnx.sig',
  };
  assert.equal(isExecutableRealEsrganRelease(approved), true);

  for (const mutation of [
    (value: any) => { value.artifacts.model.url = 'http://example.test/model.onnx'; },
    (value: any) => { value.artifacts.model.signatureUrl = ''; },
    (value: any) => { value.artifacts.model.sha256 = 'not-a-hash'; },
    (value: any) => { value.artifacts.model.size = 0; },
    (value: any) => { value.productionApprovalEvidence = 'file:///approval'; },
    (value: any) => { value.verificationKeyId = ''; },
  ]) {
    const invalid = structuredClone(approved);
    mutation(invalid);
    assert.equal(isExecutableRealEsrganRelease(invalid), false);
  }
});
