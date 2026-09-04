import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const contract = fs.readFileSync(new URL('../scripts/kandinsky-conditioning-bundle-contract.mjs', import.meta.url), 'utf8');
const finalizer = fs.readFileSync(new URL('../scripts/kandinsky-conditioning-finalize-manifest.mjs', import.meta.url), 'utf8');
const entry = fs.readFileSync(new URL('../scripts/kandinsky-conditioning-builder.py', import.meta.url), 'utf8');
const builder = fs.readFileSync(new URL('../scripts/_kandinsky-conditioning-builder-impl.py', import.meta.url), 'utf8');

test('schema v2 makes B-to-C positive embedding provenance part of canonical conditioning identity', () => {
  assert.match(contract, /KANDINSKY_CONDITIONING_SCHEMA_VERSION = 2/);
  assert.match(contract, /conditioning: \['candidateId', 'conditioningContractSha256', 'negativeMode', 'positiveEmbeddingSource'\]/);
  for (const field of ['candidateId', 'conditioningContractSha256', 'manifestSha256', 'bundleSize', 'bundleSha256', 'imageEmbedsSha256']) {
    assert.ok(contract.includes(`'${field}'`), `canonical provenance must contain ${field}`);
  }
  assert.match(contract, /positiveEmbeddingSource must be null for an independent positive embedding candidate/);
});

test('schema v2 carries exact D1 manifest byte identity through immutable sourceTrust', () => {
  assert.match(contract, /sourceTrust: \['d1ManifestPath', 'd1ManifestSha256'/);
  assert.match(contract, /assertSha\(value\.d1ManifestSha256, 'sourceTrust\.d1ManifestSha256'\)/);
  assert.match(finalizer, /const d1ManifestSha256 = sha256\(d1ManifestBytes\)/);
  assert.match(finalizer, /sourceTrust: Object\.freeze\([\s\S]*d1ManifestSha256/);
  assert.match(finalizer, /sourceManifest\.sourceTrust\.d1ManifestSha256 !== d1ManifestSha256/);
  assert.match(entry, /d1_manifest_sha256=d1_sha256/);
  assert.match(entry, /"d1ManifestSha256": d1_manifest_sha256/);
});

test('finalizer derives C provenance from reverified source bytes instead of copying builder evidence', () => {
  assert.match(finalizer, /const positiveEmbeddingSource = assertPositiveEmbeddingSource/);
  assert.match(finalizer, /sourceManifestSha256 = sha256\(sourceManifestBytes\)/);
  assert.match(finalizer, /sourceBundleSha256 = sha256\(sourceBundleBytes\)/);
  assert.match(finalizer, /imageEmbedsSha256: sourceImage\.sha256/);
  assert.match(finalizer, /conditioning: Object\.freeze\([\s\S]*positiveEmbeddingSource/);
  assert.match(finalizer, /C image_embeds are not byte-identical to accepted B image_embeds/);
});

test('public Python entrypoint rejects untrusted B provenance before internal model execution', () => {
  assert.match(entry, /prevalidate_positive_source\(/);
  assert.match(entry, /positive source manifest is not bound to the exact D1 prior identity/);
  assert.match(entry, /positive source manifest toolchain differs from current C build/);
  assert.match(entry, /positive source manifest determinism\/seed differs from current C build/);
  assert.match(entry, /positive source bundle bytes do not match canonical source manifest/);
  assert.ok(entry.indexOf('prevalidate_positive_source(') < entry.indexOf('runpy.run_path('));
});

test('Python C builder consumes canonical schema-v2 B directly with no compatibility projection', () => {
  assert.match(builder, /CONDITIONING_MANIFEST_SCHEMA_VERSION = 2/);
  assert.match(builder, /read_canonical_json\(manifest_path, "positive source manifest"\)/);
  assert.match(builder, /positive source B manifest must be an independent positive embedding candidate/);
  assert.doesNotMatch(builder, /schema.?1.?compat|compatibility.*manifest|project.*schemaVersion.*1/i);
});