import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const contract = fs.readFileSync(new URL('../scripts/kandinsky-conditioning-bundle-contract.mjs', import.meta.url), 'utf8');
const finalizer = fs.readFileSync(new URL('../scripts/kandinsky-conditioning-finalize-manifest.mjs', import.meta.url), 'utf8');
const builder = fs.readFileSync(new URL('../scripts/_kandinsky-conditioning-builder-impl.py', import.meta.url), 'utf8');

test('schema v2 makes B-to-C positive embedding provenance part of canonical conditioning identity', () => {
  assert.match(contract, /KANDINSKY_CONDITIONING_SCHEMA_VERSION = 2/);
  assert.match(contract, /conditioning: \['candidateId', 'conditioningContractSha256', 'negativeMode', 'positiveEmbeddingSource'\]/);
  for (const field of ['candidateId', 'conditioningContractSha256', 'manifestSha256', 'bundleSize', 'bundleSha256', 'imageEmbedsSha256']) {
    assert.ok(contract.includes(`'${field}'`), `canonical provenance must contain ${field}`);
  }
  assert.match(contract, /positiveEmbeddingSource must be null for an independent positive embedding candidate/);
});

test('finalizer derives C provenance from reverified source bytes instead of copying builder evidence', () => {
  assert.match(finalizer, /const positiveEmbeddingSource = assertPositiveEmbeddingSource/);
  assert.match(finalizer, /sourceManifestSha256 = sha256\(sourceManifestBytes\)/);
  assert.match(finalizer, /sourceBundleSha256 = sha256\(sourceBundleBytes\)/);
  assert.match(finalizer, /imageEmbedsSha256: sourceImage\.sha256/);
  assert.match(finalizer, /conditioning: Object\.freeze\([\s\S]*positiveEmbeddingSource/);
  assert.match(finalizer, /C image_embeds are not byte-identical to accepted B image_embeds/);
});

test('Python C builder consumes canonical schema-v2 B directly with no compatibility projection', () => {
  assert.match(builder, /CONDITIONING_MANIFEST_SCHEMA_VERSION = 2/);
  assert.match(builder, /read_canonical_json\(manifest_path, "positive source manifest"\)/);
  assert.match(builder, /positive source B manifest must be an independent positive embedding candidate/);
  assert.doesNotMatch(builder, /schema.?1.?compat|compatibility.*manifest|project.*schemaVersion.*1/i);
});
