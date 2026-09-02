import { createHash } from 'node:crypto';

export const KANDINSKY_CONDITIONING_SCHEMA_VERSION = 1;
export const KANDINSKY_CONDITIONING_STAGE = 'F5B1_D2_CONDITIONING_RESEARCH';
export const KANDINSKY_D1_MANIFEST_PATH = 'src/platform/creative/local-ai/models/kandinsky-2-2-refinement-feasibility.manifest.json';
export const KANDINSKY_D1_MODEL_ID = 'kandinsky-2-2-decoder-inpaint-refinement';
export const KANDINSKY_D1_VERSION = '0.1.0-feasibility.3';
export const KANDINSKY_PRIOR_REPOSITORY = 'kandinsky-community/kandinsky-2-2-prior';
export const KANDINSKY_PRIOR_REVISION = '40cd65123bb828e5641b118b77b38be1aee69891';
export const KANDINSKY_HISTORICAL_DIFFUSERS_REVISION = '746215670a61af1034c470d0b6555be9c60cb7b6';

export const CONDITIONING_CANDIDATE_IDS = Object.freeze([
  'A_NEUTRAL_ZERO_NEGATIVE',
  'B_REALISM_ZERO_NEGATIVE',
  'C_PRESERVATION_EXPLICIT_NEGATIVE',
]);

const SHA256 = /^[0-9a-f]{64}$/;
const EXACT_KEYS = Object.freeze({
  root: ['schemaVersion', 'stage', 'status', 'productionExecutable', 'runtimeAuthorityGranted', 'priorRuntimeDependencyAllowed', 'sourceTrust', 'historicalPipeline', 'toolchain', 'determinism', 'conditioning', 'bundle'],
  sourceTrust: ['d1ManifestPath', 'd1ModelId', 'd1Version', 'priorRepository', 'priorRevision', 'priorSafeWeights', 'priorConfigFiles'],
  identityFile: ['path', 'size', 'sha256'],
  historicalPipeline: ['diffusersRevision', 'pipelineClass', 'numImagesPerPrompt', 'numInferenceSteps', 'guidanceScale'],
  toolchain: ['containerImageDigest', 'pythonVersion', 'torchVersion', 'transformersVersion', 'numpyVersion', 'safetensorsVersion', 'platformMachine'],
  determinism: ['device', 'outputDtype', 'torchDeterministicAlgorithms', 'numThreads', 'numInteropThreads', 'ompNumThreads', 'mklNumThreads', 'seed'],
  conditioning: ['candidateId', 'conditioningContractSha256', 'negativeMode'],
  bundle: ['format', 'metadataPolicy', 'tensorOrder', 'tensors', 'size', 'sha256'],
  tensor: ['dtype', 'shape'],
});

const DYNAMIC_IDENTITY_KEYS = new Set([
  'runId', 'runNumber', 'runAttempt', 'timestamp', 'createdAt', 'generatedAt', 'hostname', 'host', 'runnerName', 'runnerId', 'workspace', 'cachePath',
]);

export function assertKandinskyConditioningManifest(value, d1Manifest) {
  assertPlainObject(value, 'manifest');
  assertExactKeys(value, EXACT_KEYS.root, 'manifest');
  rejectDynamicIdentityKeys(value, 'manifest');

  assertEqual(value.schemaVersion, KANDINSKY_CONDITIONING_SCHEMA_VERSION, 'schemaVersion');
  assertEqual(value.stage, KANDINSKY_CONDITIONING_STAGE, 'stage');
  assertEqual(value.status, 'RESEARCH_CANDIDATE', 'status');
  assertEqual(value.productionExecutable, false, 'productionExecutable');
  assertEqual(value.runtimeAuthorityGranted, false, 'runtimeAuthorityGranted');
  assertEqual(value.priorRuntimeDependencyAllowed, false, 'priorRuntimeDependencyAllowed');

  assertD1SourceTrust(value.sourceTrust, d1Manifest);
  assertHistoricalPipeline(value.historicalPipeline);
  assertToolchain(value.toolchain);
  assertDeterminism(value.determinism);
  assertConditioning(value.conditioning);
  assertBundle(value.bundle);
  return value;
}

export function canonicalJsonBytes(value) {
  rejectDynamicIdentityKeys(value, 'manifest');
  return Buffer.from(`${JSON.stringify(sortRecursively(value))}\n`, 'utf8');
}

export function assertCanonicalManifestBytes(bytes, d1Manifest) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) throw new Error('manifest bytes must be bytes');
  const raw = Buffer.from(bytes);
  const decoded = raw.toString('utf8');
  if (Buffer.from(decoded, 'utf8').compare(raw) !== 0) throw new Error('manifest must be valid UTF-8');
  let value;
  try { value = JSON.parse(decoded); } catch (error) { throw new Error(`manifest JSON is invalid: ${error.message}`); }
  assertKandinskyConditioningManifest(value, d1Manifest);
  const canonical = canonicalJsonBytes(value);
  if (!raw.equals(canonical)) throw new Error('manifest bytes are not canonical JSON');
  return value;
}

export function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertD1SourceTrust(value, d1Manifest) {
  assertPlainObject(value, 'sourceTrust');
  assertExactKeys(value, EXACT_KEYS.sourceTrust, 'sourceTrust');
  assertEqual(value.d1ManifestPath, KANDINSKY_D1_MANIFEST_PATH, 'sourceTrust.d1ManifestPath');
  assertEqual(value.d1ModelId, KANDINSKY_D1_MODEL_ID, 'sourceTrust.d1ModelId');
  assertEqual(value.d1Version, KANDINSKY_D1_VERSION, 'sourceTrust.d1Version');
  assertEqual(value.priorRepository, KANDINSKY_PRIOR_REPOSITORY, 'sourceTrust.priorRepository');
  assertEqual(value.priorRevision, KANDINSKY_PRIOR_REVISION, 'sourceTrust.priorRevision');

  assertPlainObject(d1Manifest, 'D1 manifest');
  assertEqual(d1Manifest.modelId, KANDINSKY_D1_MODEL_ID, 'D1 modelId');
  assertEqual(d1Manifest.version, KANDINSKY_D1_VERSION, 'D1 version');
  assertEqual(d1Manifest.status, 'CANDIDATE', 'D1 status');
  assertEqual(d1Manifest.productionExecutable, false, 'D1 productionExecutable');
  assertEqual(d1Manifest.runtimeAuthorityGranted, false, 'D1 runtimeAuthorityGranted');
  assertPlainObject(d1Manifest.offlinePrior, 'D1 offlinePrior');
  assertEqual(d1Manifest.offlinePrior.repository, KANDINSKY_PRIOR_REPOSITORY, 'D1 prior repository');
  assertEqual(d1Manifest.offlinePrior.revision, KANDINSKY_PRIOR_REVISION, 'D1 prior revision');
  assertEqual(d1Manifest.offlinePrior.runtimeDependencyAllowed, false, 'D1 prior runtimeDependencyAllowed');
  assertPlainObject(d1Manifest.offlinePrior.requiredConfigIdentity, 'D1 prior requiredConfigIdentity');
  assertEqual(d1Manifest.offlinePrior.requiredConfigIdentity.state, 'PINNED', 'D1 prior config state');

  assertIdentityList(value.priorSafeWeights, d1Manifest.offlinePrior.safeWeights, 'sourceTrust.priorSafeWeights');
  assertIdentityList(value.priorConfigFiles, d1Manifest.offlinePrior.requiredConfigIdentity.files, 'sourceTrust.priorConfigFiles');
}

function assertIdentityList(actualList, expectedList, path) {
  if (!Array.isArray(expectedList) || expectedList.length < 1) throw new Error(`${path} source identity is missing from D1`);
  if (!Array.isArray(actualList) || actualList.length !== expectedList.length) throw new Error(`${path} cardinality mismatch`);
  const observedPaths = new Set();
  for (let index = 0; index < expectedList.length; index += 1) {
    const expected = expectedList[index];
    const actual = actualList[index];
    assertPlainObject(actual, `${path}[${index}]`);
    assertExactKeys(actual, EXACT_KEYS.identityFile, `${path}[${index}]`);
    assertNonEmptyString(actual.path, `${path}[${index}].path`);
    if (observedPaths.has(actual.path)) throw new Error(`${path} contains duplicate paths`);
    observedPaths.add(actual.path);
    assertPositiveSafeInteger(actual.size, `${path}[${index}].size`);
    assertSha(actual.sha256, `${path}[${index}].sha256`);
    assertEqual(actual.path, expected.path, `${path}[${index}].path`);
    assertEqual(actual.size, expected.size, `${path}[${index}].size`);
    assertEqual(actual.sha256, expected.sha256, `${path}[${index}].sha256`);
  }
}

function assertHistoricalPipeline(value) {
  assertPlainObject(value, 'historicalPipeline');
  assertExactKeys(value, EXACT_KEYS.historicalPipeline, 'historicalPipeline');
  assertEqual(value.diffusersRevision, KANDINSKY_HISTORICAL_DIFFUSERS_REVISION, 'historicalPipeline.diffusersRevision');
  assertEqual(value.pipelineClass, 'KandinskyV22PriorPipeline', 'historicalPipeline.pipelineClass');
  assertEqual(value.numImagesPerPrompt, 1, 'historicalPipeline.numImagesPerPrompt');
  assertEqual(value.numInferenceSteps, 25, 'historicalPipeline.numInferenceSteps');
  assertEqual(value.guidanceScale, 4, 'historicalPipeline.guidanceScale');
}

function assertToolchain(value) {
  assertPlainObject(value, 'toolchain');
  assertExactKeys(value, EXACT_KEYS.toolchain, 'toolchain');
  if (typeof value.containerImageDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value.containerImageDigest)) throw new Error('toolchain.containerImageDigest must be an exact sha256 digest');
  for (const key of ['pythonVersion', 'torchVersion', 'transformersVersion', 'numpyVersion', 'safetensorsVersion', 'platformMachine']) assertNonEmptyString(value[key], `toolchain.${key}`);
  for (const key of ['pythonVersion', 'torchVersion', 'transformersVersion', 'numpyVersion', 'safetensorsVersion']) {
    if (/[*<>=~^]|latest/i.test(value[key])) throw new Error(`toolchain.${key} must be an exact tested identity`);
  }
}

function assertDeterminism(value) {
  assertPlainObject(value, 'determinism');
  assertExactKeys(value, EXACT_KEYS.determinism, 'determinism');
  assertEqual(value.device, 'cpu', 'determinism.device');
  assertEqual(value.outputDtype, 'float32', 'determinism.outputDtype');
  assertEqual(value.torchDeterministicAlgorithms, true, 'determinism.torchDeterministicAlgorithms');
  for (const key of ['numThreads', 'numInteropThreads', 'ompNumThreads', 'mklNumThreads']) assertEqual(value[key], 1, `determinism.${key}`);
  if (!Number.isSafeInteger(value.seed) || value.seed < 0) throw new Error('determinism.seed must be a non-negative safe integer');
}

function assertConditioning(value) {
  assertPlainObject(value, 'conditioning');
  assertExactKeys(value, EXACT_KEYS.conditioning, 'conditioning');
  if (!CONDITIONING_CANDIDATE_IDS.includes(value.candidateId)) throw new Error('conditioning.candidateId is not a closed D2 research identity');
  assertSha(value.conditioningContractSha256, 'conditioning.conditioningContractSha256');
  const expectedMode = value.candidateId === 'C_PRESERVATION_EXPLICIT_NEGATIVE' ? 'EXPLICIT_NEGATIVE_PRIOR' : 'HISTORICAL_ZERO_IMAGE';
  assertEqual(value.negativeMode, expectedMode, 'conditioning.negativeMode');
}

function assertBundle(value) {
  assertPlainObject(value, 'bundle');
  assertExactKeys(value, EXACT_KEYS.bundle, 'bundle');
  assertEqual(value.format, 'safetensors', 'bundle.format');
  assertEqual(value.metadataPolicy, 'NONE', 'bundle.metadataPolicy');
  if (!Array.isArray(value.tensorOrder) || value.tensorOrder.length !== 2 || value.tensorOrder[0] !== 'image_embeds' || value.tensorOrder[1] !== 'negative_image_embeds') throw new Error('bundle.tensorOrder must be exactly image_embeds, negative_image_embeds');
  assertPlainObject(value.tensors, 'bundle.tensors');
  assertExactKeys(value.tensors, ['image_embeds', 'negative_image_embeds'], 'bundle.tensors');
  for (const name of value.tensorOrder) {
    const tensor = value.tensors[name];
    assertPlainObject(tensor, `bundle.tensors.${name}`);
    assertExactKeys(tensor, EXACT_KEYS.tensor, `bundle.tensors.${name}`);
    assertEqual(tensor.dtype, 'F32', `bundle.tensors.${name}.dtype`);
    if (!Array.isArray(tensor.shape) || tensor.shape.length < 1 || tensor.shape.some((dimension) => !Number.isSafeInteger(dimension) || dimension < 1)) throw new Error(`bundle.tensors.${name}.shape must record actual positive dimensions`);
  }
  assertPositiveSafeInteger(value.size, 'bundle.size');
  assertSha(value.sha256, 'bundle.sha256');
}

function rejectDynamicIdentityKeys(value, path) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectDynamicIdentityKeys(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (DYNAMIC_IDENTITY_KEYS.has(key)) throw new Error(`${path}.${key} is forbidden from immutable conditioning identity`);
    rejectDynamicIdentityKeys(child, `${path}.${key}`);
  }
}

function sortRecursively(value) {
  if (Array.isArray(value)) return value.map(sortRecursively);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortRecursively(value[key])]));
}

function assertPlainObject(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${path} must be a plain object`);
}
function assertExactKeys(value, expected, path) {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || required.some((key, index) => actual[index] !== key)) throw new Error(`${path} keys are outside the closed schema`);
}
function assertEqual(actual, expected, path) {
  if (actual !== expected) throw new Error(`${path} mismatch`);
}
function assertNonEmptyString(value, path) {
  if (typeof value !== 'string' || !value || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(`${path} must be a non-empty normalized string`);
}
function assertPositiveSafeInteger(value, path) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${path} must be a positive safe integer`);
}
function assertSha(value, path) {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`${path} must be lowercase SHA-256`);
}
