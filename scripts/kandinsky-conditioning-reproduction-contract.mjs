import { conditioningCandidateIdentity } from './kandinsky-conditioning-candidate-registry.mjs';

export const KANDINSKY_CONDITIONING_REPRODUCTION_SCHEMA_VERSION = 1;
export const KANDINSKY_CONDITIONING_REPRODUCTION_STAGE = 'F5B1_D2_CONDITIONING_REPRODUCTION';
export const KANDINSKY_CONDITIONING_REPRODUCTION_STATUS = 'TWO_BUILD_BYTE_IDENTICAL_RESEARCH_EVIDENCE';

const SHA256 = /^[0-9a-f]{64}$/;
const DYNAMIC_IDENTITY_KEYS = new Set([
  'runId', 'runNumber', 'runAttempt', 'timestamp', 'createdAt', 'generatedAt', 'hostname', 'host',
  'runnerName', 'runnerId', 'workspace', 'cachePath',
]);

export function assertKandinskyConditioningReproductionRecord(value) {
  assertObject(value, 'reproduction');
  exactKeys(value, [
    'schemaVersion', 'stage', 'status', 'productionExecutable', 'runtimeAuthorityGranted', 'priorRuntimeDependencyAllowed',
    'candidateId', 'conditioningContractSha256', 'd1ManifestSha256', 'buildCount', 'conditioningManifest',
    'builderEvidence', 'bundle', 'positiveEmbeddingSource',
  ], 'reproduction');
  rejectDynamicIdentityKeys(value, 'reproduction');

  equal(value.schemaVersion, KANDINSKY_CONDITIONING_REPRODUCTION_SCHEMA_VERSION, 'schemaVersion');
  equal(value.stage, KANDINSKY_CONDITIONING_REPRODUCTION_STAGE, 'stage');
  equal(value.status, KANDINSKY_CONDITIONING_REPRODUCTION_STATUS, 'status');
  equal(value.productionExecutable, false, 'productionExecutable');
  equal(value.runtimeAuthorityGranted, false, 'runtimeAuthorityGranted');
  equal(value.priorRuntimeDependencyAllowed, false, 'priorRuntimeDependencyAllowed');
  equal(value.buildCount, 2, 'buildCount');

  const identity = conditioningCandidateIdentity(value.candidateId);
  assertSha(value.conditioningContractSha256, 'conditioningContractSha256');
  equal(value.conditioningContractSha256, identity.conditioningContractSha256, 'conditioningContractSha256');
  assertSha(value.d1ManifestSha256, 'd1ManifestSha256');

  assertFileIdentity(value.conditioningManifest, 'conditioningManifest');
  assertFileIdentity(value.builderEvidence, 'builderEvidence');
  assertBundle(value.bundle);
  assertPositiveSource(value.positiveEmbeddingSource, identity.positiveEmbeddingSourceCandidateId);
  return value;
}

export function canonicalReproductionJsonBytes(value) {
  assertKandinskyConditioningReproductionRecord(value);
  return Buffer.from(`${JSON.stringify(sortRecursively(value))}\n`, 'utf8');
}

export function assertCanonicalReproductionBytes(bytes) {
  const raw = Buffer.from(bytes);
  const text = raw.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(raw)) throw new Error('reproduction evidence must be valid UTF-8');
  let value;
  try { value = JSON.parse(text); }
  catch (error) { throw new Error(`reproduction evidence JSON is invalid: ${error.message}`); }
  assertKandinskyConditioningReproductionRecord(value);
  if (!raw.equals(canonicalReproductionJsonBytes(value))) throw new Error('reproduction evidence bytes are not canonical JSON');
  return value;
}

function assertFileIdentity(value, label) {
  assertObject(value, label);
  exactKeys(value, ['size', 'sha256'], label);
  positiveSafeInteger(value.size, `${label}.size`);
  assertSha(value.sha256, `${label}.sha256`);
}

function assertBundle(value) {
  assertObject(value, 'bundle');
  exactKeys(value, ['size', 'sha256', 'tensors'], 'bundle');
  positiveSafeInteger(value.size, 'bundle.size');
  assertSha(value.sha256, 'bundle.sha256');
  assertObject(value.tensors, 'bundle.tensors');
  exactKeys(value.tensors, ['image_embeds', 'negative_image_embeds'], 'bundle.tensors');
  for (const name of ['image_embeds', 'negative_image_embeds']) {
    const tensor = value.tensors[name];
    assertObject(tensor, `bundle.tensors.${name}`);
    exactKeys(tensor, ['dtype', 'shape', 'sha256'], `bundle.tensors.${name}`);
    equal(tensor.dtype, 'F32', `bundle.tensors.${name}.dtype`);
    if (!Array.isArray(tensor.shape) || tensor.shape.length < 1 || tensor.shape.some(dimension => !Number.isSafeInteger(dimension) || dimension < 1)) {
      throw new Error(`bundle.tensors.${name}.shape must contain positive safe integers`);
    }
    assertSha(tensor.sha256, `bundle.tensors.${name}.sha256`);
  }
  if (JSON.stringify(value.tensors.image_embeds.shape) !== JSON.stringify(value.tensors.negative_image_embeds.shape)) {
    throw new Error('bundle positive/negative tensor shapes must match');
  }
}

function assertPositiveSource(value, expectedCandidateId) {
  if (expectedCandidateId === null) {
    if (value !== null) throw new Error('positiveEmbeddingSource must be null for this candidate');
    return;
  }
  assertObject(value, 'positiveEmbeddingSource');
  exactKeys(value, ['candidateId','conditioningContractSha256','manifestSha256','bundleSize','bundleSha256','imageEmbedsSha256'], 'positiveEmbeddingSource');
  equal(value.candidateId, expectedCandidateId, 'positiveEmbeddingSource.candidateId');
  const sourceIdentity = conditioningCandidateIdentity(expectedCandidateId);
  assertSha(value.conditioningContractSha256, 'positiveEmbeddingSource.conditioningContractSha256');
  equal(value.conditioningContractSha256, sourceIdentity.conditioningContractSha256, 'positiveEmbeddingSource.conditioningContractSha256');
  assertSha(value.manifestSha256, 'positiveEmbeddingSource.manifestSha256');
  positiveSafeInteger(value.bundleSize, 'positiveEmbeddingSource.bundleSize');
  assertSha(value.bundleSha256, 'positiveEmbeddingSource.bundleSha256');
  assertSha(value.imageEmbedsSha256, 'positiveEmbeddingSource.imageEmbedsSha256');
}

function rejectDynamicIdentityKeys(value, label) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectDynamicIdentityKeys(item, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (DYNAMIC_IDENTITY_KEYS.has(key)) throw new Error(`${label}.${key} is forbidden from immutable reproduction identity`);
    rejectDynamicIdentityKeys(child, `${label}.${key}`);
  }
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || wanted.some((key, index) => actual[index] !== key)) throw new Error(`${label} keys are outside the closed schema`);
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object`);
}

function positiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive safe integer`);
}

function assertSha(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`${label} must be lowercase SHA-256`);
}

function equal(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} mismatch`);
}

function sortRecursively(value) {
  if (Array.isArray(value)) return value.map(sortRecursively);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortRecursively(value[key])]));
}
