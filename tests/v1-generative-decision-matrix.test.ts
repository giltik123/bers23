import assert from 'node:assert/strict';
import test from 'node:test';

import matrix from '../config/v1-generative-decision-matrix.json' with { type: 'json' };
import mobileSam from '../src/platform/creative/local-ai/models/interactive-segmentation.manifest.json' with { type: 'json' };
import modNet from '../src/platform/creative/local-ai/models/portrait-matting.manifest.json' with { type: 'json' };
import realEsrgan from '../src/platform/creative/local-ai/models/super-resolution.manifest.json' with { type: 'json' };
import laMa from '../src/platform/creative/local-ai/models/lama-inpainting.manifest.json' with { type: 'json' };
import tinySd from '../src/platform/creative/local-ai/models/tiny-sd-generation.manifest.json' with { type: 'json' };
import kandinsky from '../src/platform/creative/local-ai/models/kandinsky-2-2-refinement-feasibility.manifest.json' with { type: 'json' };
import { productionLocalModelsByCapability } from '../server/core/localExecution/productionLocalModelPolicy.ts';
import { productionLocalExecutorsByCapability } from '../server/core/localExecution/productionLocalExecutorPolicy.ts';

const expectedTracks = [
  'D1_MOBILESAM_SEGMENTATION',
  'D2_MODNET_MATTING',
  'D3_REALESRGAN_RESTORATION',
  'D4_LAMA_INPAINTING',
  'D5_TINY_SD_GENERATION',
  'D6_KANDINSKY_REFINEMENT',
];

const manifests = new Map([
  ['D1_MOBILESAM_SEGMENTATION', mobileSam],
  ['D2_MODNET_MATTING', modNet],
  ['D3_REALESRGAN_RESTORATION', realEsrgan],
  ['D4_LAMA_INPAINTING', laMa],
  ['D5_TINY_SD_GENERATION', tinySd],
  ['D6_KANDINSKY_REFINEMENT', kandinsky],
]);

test('Stage D v1 matrix covers every mandatory D1-D6 track exactly once with an explicit non-ambiguous product decision', () => {
  assert.equal(matrix.schemaVersion, 1);
  assert.equal(matrix.program, 'BERS_V1_STAGE_D_GENERATIVE_DECISION_MATRIX');
  assert.equal(matrix.releaseAuthority, 'NO_ENTRY_GRANTS_PRODUCTION_AUTHORITY');
  assert.match(matrix.evidenceBaseSha, /^[0-9a-f]{40}$/);

  const tracks = matrix.entries.map(entry => entry.track).sort();
  assert.deepEqual(tracks, [...expectedTracks].sort());
  assert.equal(new Set(tracks).size, expectedTracks.length);

  const allowedReadiness = new Set(['SOFTWARE_READY_EVIDENCE_PENDING', 'CANDIDATE', 'R&D_ONLY']);
  const allowedDecisions = new Set(['EXPLICIT_REJECTION_FOR_V1_DEFAULT', 'DETERMINISTIC_FALLBACK']);
  for (const entry of matrix.entries) {
    assert.equal(allowedReadiness.has(entry.readiness), true, `${entry.track} readiness must remain non-production`);
    assert.equal(allowedDecisions.has(entry.v1Decision), true, `${entry.track} must have an explicit v1 decision`);
    assert.equal(entry.productionEnabled, false, `${entry.track} must not be production enabled`);
    assert.equal(typeof entry.productFallback, 'string');
    assert.ok(entry.productFallback.length > 0);
    assert.ok(Array.isArray(entry.blockers) && entry.blockers.length > 0, `${entry.track} must retain concrete blockers`);
    assert.equal(entry.evidence.deviceTier, 'NO_PRODUCTION_TIER_ADMITTED');
  }
});

test('Stage D matrix identity and status stay bound to the exact candidate manifests', () => {
  for (const entry of matrix.entries) {
    const manifest = manifests.get(entry.track);
    assert.ok(manifest, `missing manifest binding for ${entry.track}`);
    assert.equal(entry.modelId, manifest.modelId, `${entry.track} model identity drift`);
    assert.equal(entry.version, manifest.version, `${entry.track} version drift`);
    assert.equal(entry.manifestStatus, manifest.status, `${entry.track} release status drift`);
    assert.equal(manifest.status, 'CANDIDATE', `${entry.track} cannot silently promote while matrix says non-production`);
  }
});

test('Stage D package evidence is either manifest-bound or explicitly unknown', () => {
  const byTrack = Object.fromEntries(matrix.entries.map(entry => [entry.track, entry]));
  assert.equal(byTrack.D1_MOBILESAM_SEGMENTATION.evidence.runtimePackageBytes,
    mobileSam.artifacts.encoder.size + mobileSam.artifacts.decoder.size);
  assert.equal(byTrack.D2_MODNET_MATTING.evidence.runtimePackageBytes, modNet.bersExport.onnxSize);
  assert.equal(byTrack.D3_REALESRGAN_RESTORATION.evidence.runtimePackageBytes, null);
  assert.equal(realEsrgan.artifactState, 'EXPORT_REQUIRED');
  assert.equal(byTrack.D4_LAMA_INPAINTING.evidence.runtimePackageBytes, laMa.bersArtifact.size);
  assert.equal(byTrack.D5_TINY_SD_GENERATION.evidence.runtimePackageBytes, tinySd.upstream.snapshot.totalRuntimeBytes);
  assert.equal(byTrack.D6_KANDINSKY_REFINEMENT.evidence.runtimePackageBytes, kandinsky.decoder.safeWeightBytes);
});

test('every Stage D v1-rejected/fallback model remains absent from production model and MODEL executor authority', () => {
  const modelIds = new Set(matrix.entries.map(entry => entry.modelId));
  const productionModelIds = Object.values(productionLocalModelsByCapability)
    .flatMap(bindings => bindings.map(binding => binding.modelId));
  const productionExecutorModelIds = Object.values(productionLocalExecutorsByCapability)
    .flatMap(bindings => bindings)
    .filter(binding => binding.kind === 'MODEL')
    .map(binding => binding.modelId);

  for (const modelId of modelIds) {
    assert.equal(productionModelIds.includes(modelId), false, `${modelId} unexpectedly entered production v1 model authority`);
    assert.equal(productionExecutorModelIds.includes(modelId), false, `${modelId} unexpectedly entered production v2 MODEL executor authority`);
  }
});

test('matrix decisions preserve the v1 deterministic/manual fallbacks rather than implying cloud fallback', () => {
  const text = JSON.stringify(matrix);
  assert.doesNotMatch(text, /CLOUD_FALLBACK|PROVIDER_FALLBACK|PAID_CREDIT_FALLBACK|PRODUCTION_APPROVED/);
  assert.match(text, /MANUAL_CANONICAL_SELECTION/);
  assert.match(text, /DETERMINISTIC_MASKED_EDITING_AND_FASHION_F4/);
  assert.match(text, /DETERMINISTIC_FASHION_F4/);
});
