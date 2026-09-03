#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertCanonicalManifestBytes,
  assertKandinskyConditioningManifest,
  canonicalJsonBytes,
  sha256Bytes,
} from './kandinsky-conditioning-bundle-contract.mjs';
import { conditioningCandidateIdentity } from './kandinsky-conditioning-candidate-registry.mjs';
import { conditioningPromptContract } from './kandinsky-conditioning-prompt-contract.mjs';

const args = parseArgs(process.argv.slice(2));
const d1 = readJson(args.d1, 'D1 manifest');
const prompt = readJson(args.prompt, 'D2b prompt contract');
const evidence = readJson(args.evidence, 'D2c builder evidence');
const targetBundleBytes = readBytes(args.bundle, 'D2c conditioning bundle');

const expectedPrompt = conditioningPromptContract(prompt.candidateId);
if (!canonicalJson(prompt).equals(canonicalJson(expectedPrompt.contract))) {
  fail('D2c prompt contract bytes do not match the accepted D2b candidate');
}
if (evidence.conditioningContractSha256 !== expectedPrompt.sha256) {
  fail('D2c evidence is not bound to the accepted D2b prompt contract');
}
const candidateIdentity = conditioningCandidateIdentity(prompt.candidateId);
const targetParsed = assertEvidenceAndTargetBundle(evidence, prompt.candidateId, candidateIdentity, targetBundleBytes);
assertPositiveEmbeddingSource({ args, d1, evidence, targetParsed, candidateIdentity });

const manifest = Object.freeze({
  schemaVersion: 1,
  stage: 'F5B1_D2_CONDITIONING_RESEARCH',
  status: 'RESEARCH_CANDIDATE',
  productionExecutable: false,
  runtimeAuthorityGranted: false,
  priorRuntimeDependencyAllowed: false,
  sourceTrust: Object.freeze({
    d1ManifestPath: 'src/platform/creative/local-ai/models/kandinsky-2-2-refinement-feasibility.manifest.json',
    d1ModelId: d1.modelId,
    d1Version: d1.version,
    priorRepository: d1.offlinePrior.repository,
    priorRevision: d1.offlinePrior.revision,
    priorSafeWeights: Object.freeze(d1.offlinePrior.safeWeights.map(copyIdentity)),
    priorConfigFiles: Object.freeze(d1.offlinePrior.requiredConfigIdentity.files.map(copyIdentity)),
  }),
  historicalPipeline: Object.freeze({
    diffusersRevision: prompt.prior.diffusersRevision,
    pipelineClass: prompt.prior.pipelineClass,
    numImagesPerPrompt: prompt.prior.numImagesPerPrompt,
    numInferenceSteps: prompt.prior.numInferenceSteps,
    guidanceScale: prompt.prior.guidanceScale,
    outputType: prompt.prior.outputType,
  }),
  toolchain: Object.freeze(manifestToolchainFromEvidence(evidence.toolchain)),
  determinism: Object.freeze(manifestDeterminismFromEvidence(evidence.determinism)),
  conditioning: Object.freeze({
    candidateId: prompt.candidateId,
    conditioningContractSha256: expectedPrompt.sha256,
    negativeMode: prompt.negativeMode,
  }),
  bundle: Object.freeze({
    format: evidence.bundle.format,
    metadataPolicy: evidence.bundle.metadataPolicy,
    tensorOrder: Object.freeze([...evidence.bundle.tensorOrder]),
    tensors: Object.freeze({
      image_embeds: Object.freeze({ dtype: evidence.bundle.tensors.image_embeds.dtype, shape: Object.freeze([...evidence.bundle.tensors.image_embeds.shape]) }),
      negative_image_embeds: Object.freeze({ dtype: evidence.bundle.tensors.negative_image_embeds.dtype, shape: Object.freeze([...evidence.bundle.tensors.negative_image_embeds.shape]) }),
    }),
    size: evidence.bundle.size,
    sha256: evidence.bundle.sha256,
  }),
});

assertKandinskyConditioningManifest(manifest, d1);
const output = canonicalJsonBytes(manifest);
fs.mkdirSync(path.dirname(args.output), { recursive: true });
writeAtomic(args.output, output);
process.stdout.write(`${JSON.stringify({
  status: 'FINALIZED_RESEARCH_MANIFEST',
  candidateId: prompt.candidateId,
  manifestSha256: sha256Bytes(output),
  output: args.output,
})}\n`);

function assertEvidenceAndTargetBundle(value, candidateId, identity, bundleBytes) {
  exactKeys(value, [
    'schemaVersion', 'stage', 'status', 'candidateId', 'conditioningContractSha256', 'positiveEmbeddingSource',
    'sourceTrust', 'toolchain', 'determinism', 'bundle',
  ], 'builder evidence');
  if (value.schemaVersion !== 1 || value.stage !== 'F5B1_D2C_CONDITIONING_BUILD' || value.status !== 'BUILT_NOT_ADMITTED') {
    fail('builder evidence stage/status mismatch');
  }
  if (value.candidateId !== candidateId) fail('builder evidence candidate mismatch');
  if (value.conditioningContractSha256 !== identity.conditioningContractSha256) fail('builder evidence conditioning SHA mismatch');

  exactKeys(value.sourceTrust, ['d1ModelId','d1Version','priorRepository','priorRevision','priorPipelineGitBlobSha1'], 'builder evidence sourceTrust');
  if (value.sourceTrust.d1ModelId !== d1.modelId || value.sourceTrust.d1Version !== d1.version || value.sourceTrust.priorRepository !== d1.offlinePrior.repository || value.sourceTrust.priorRevision !== d1.offlinePrior.revision) {
    fail('builder evidence source trust mismatch');
  }
  if (value.sourceTrust.priorPipelineGitBlobSha1 !== '3b9974a5dd70e8b775caa01efab6b637ff22d9e5') {
    fail('builder evidence historical prior source mismatch');
  }

  exactKeys(value.toolchain, ['schemaVersion','status','containerImageDigest','pythonVersion','diffusersVersion','torchVersion','transformersVersion','numpyVersion','safetensorsVersion','platformMachine'], 'builder evidence toolchain');
  if (value.toolchain.schemaVersion !== 1 || value.toolchain.status !== 'TESTED_EXACT') fail('builder evidence toolchain is not tested/exact');
  if (!/^sha256:[0-9a-f]{64}$/.test(value.toolchain.containerImageDigest)) fail('builder evidence container digest is invalid');

  exactKeys(value.determinism, ['device','outputDtype','torchDeterministicAlgorithms','numThreads','numInteropThreads','ompNumThreads','mklNumThreads','seed','generatorPolicy','latentPolicy','networkPolicy'], 'builder evidence determinism');
  if (value.determinism.device !== 'cpu' || value.determinism.outputDtype !== 'float32' || value.determinism.torchDeterministicAlgorithms !== true) fail('builder evidence deterministic device/dtype mismatch');
  for (const key of ['numThreads','numInteropThreads','ompNumThreads','mklNumThreads']) if (value.determinism[key] !== 1) fail(`builder evidence ${key} mismatch`);
  if (value.determinism.generatorPolicy !== 'TORCH_CPU_GENERATOR_SINGLE_SEED' || value.determinism.latentPolicy !== 'NO_EXTERNAL_LATENTS_PIPELINE_RANDN') fail('builder evidence generator/latent policy mismatch');
  if (value.determinism.networkPolicy !== 'CONTAINER_NETWORK_NONE_PLUS_LIBRARY_OFFLINE_GUARD') fail('builder evidence network isolation mismatch');

  const parsed = parseSafetensors(bundleBytes, 'target conditioning bundle');
  exactKeys(value.bundle, ['format','metadataPolicy','tensorOrder','tensors','size','sha256'], 'builder evidence bundle');
  if (value.bundle.format !== 'safetensors' || value.bundle.metadataPolicy !== 'NONE') fail('builder evidence bundle format mismatch');
  if (JSON.stringify(value.bundle.tensorOrder) !== JSON.stringify(['image_embeds','negative_image_embeds'])) fail('builder evidence tensor order mismatch');
  if (value.bundle.size !== bundleBytes.length || value.bundle.sha256 !== sha256(bundleBytes)) fail('builder evidence bundle bytes mismatch');
  assertEvidenceTensor(value.bundle.tensors.image_embeds, parsed.tensors.image_embeds, 'image_embeds');
  assertEvidenceTensor(value.bundle.tensors.negative_image_embeds, parsed.tensors.negative_image_embeds, 'negative_image_embeds');
  return parsed;
}

function assertEvidenceTensor(evidenceTensor, parsedTensor, name) {
  exactKeys(evidenceTensor, ['dtype','shape','sha256'], `builder evidence bundle.tensors.${name}`);
  if (evidenceTensor.dtype !== parsedTensor.dtype || JSON.stringify(evidenceTensor.shape) !== JSON.stringify(parsedTensor.shape)) fail(`builder evidence ${name} dtype/shape mismatch`);
  if (!/^[0-9a-f]{64}$/.test(evidenceTensor.sha256) || evidenceTensor.sha256 !== parsedTensor.sha256) fail(`builder evidence ${name} raw SHA mismatch`);
}

function assertPositiveEmbeddingSource({ args, d1, evidence, targetParsed, candidateIdentity }) {
  const expectedSourceCandidateId = candidateIdentity.positiveEmbeddingSourceCandidateId;
  const hasSourceManifest = typeof args.positiveSourceManifest === 'string';
  const hasSourceBundle = typeof args.positiveSourceBundle === 'string';

  if (expectedSourceCandidateId === null) {
    if (hasSourceManifest || hasSourceBundle) fail('A/B finalization forbids positive source inputs');
    if (evidence.positiveEmbeddingSource !== null) fail('A/B builder evidence must not claim a positive source');
    return;
  }
  if (!hasSourceManifest || !hasSourceBundle) fail('C finalization requires B source manifest and bundle');

  const sourceManifestBytes = readBytes(args.positiveSourceManifest, 'positive source manifest');
  const sourceManifest = assertCanonicalManifestBytes(sourceManifestBytes, d1);
  if (sourceManifest.conditioning.candidateId !== expectedSourceCandidateId) fail('positive source manifest candidate mismatch');
  const sourceIdentity = conditioningCandidateIdentity(expectedSourceCandidateId);
  if (sourceManifest.conditioning.conditioningContractSha256 !== sourceIdentity.conditioningContractSha256) fail('positive source manifest contract identity mismatch');
  if (!canonicalJson(sourceManifest.toolchain).equals(canonicalJson(manifestToolchainFromEvidence(evidence.toolchain)))) fail('positive source toolchain differs from target C toolchain');
  if (!canonicalJson(sourceManifest.determinism).equals(canonicalJson(manifestDeterminismFromEvidence(evidence.determinism)))) fail('positive source determinism differs from target C determinism/seed');

  const sourceBundleBytes = readBytes(args.positiveSourceBundle, 'positive source conditioning bundle');
  const sourceParsed = assertBundleMatchesManifest(sourceBundleBytes, sourceManifest, 'positive source bundle');
  const targetImage = targetParsed.tensors.image_embeds;
  const sourceImage = sourceParsed.tensors.image_embeds;
  if (!targetImage.bytes.equals(sourceImage.bytes)) fail('C image_embeds are not byte-identical to accepted B image_embeds');

  const sourceEvidence = evidence.positiveEmbeddingSource;
  exactKeys(sourceEvidence, ['candidateId','conditioningContractSha256','manifestSha256','bundleSize','bundleSha256','imageEmbedsSha256'], 'builder evidence positiveEmbeddingSource');
  if (sourceEvidence.candidateId !== expectedSourceCandidateId || sourceEvidence.conditioningContractSha256 !== sourceIdentity.conditioningContractSha256) fail('builder evidence positive source identity mismatch');
  if (sourceEvidence.manifestSha256 !== sha256(sourceManifestBytes)) fail('builder evidence positive source manifest SHA mismatch');
  if (sourceEvidence.bundleSize !== sourceBundleBytes.length || sourceEvidence.bundleSha256 !== sha256(sourceBundleBytes)) fail('builder evidence positive source bundle identity mismatch');
  if (sourceEvidence.imageEmbedsSha256 !== sourceImage.sha256 || sourceEvidence.imageEmbedsSha256 !== targetImage.sha256) fail('builder evidence positive source image SHA mismatch');
}

function manifestToolchainFromEvidence(toolchain) {
  return {
    containerImageDigest: toolchain.containerImageDigest,
    pythonVersion: toolchain.pythonVersion,
    diffusersVersion: toolchain.diffusersVersion,
    torchVersion: toolchain.torchVersion,
    transformersVersion: toolchain.transformersVersion,
    numpyVersion: toolchain.numpyVersion,
    safetensorsVersion: toolchain.safetensorsVersion,
    platformMachine: toolchain.platformMachine,
  };
}

function manifestDeterminismFromEvidence(determinism) {
  return {
    device: determinism.device,
    outputDtype: determinism.outputDtype,
    torchDeterministicAlgorithms: determinism.torchDeterministicAlgorithms,
    numThreads: determinism.numThreads,
    numInteropThreads: determinism.numInteropThreads,
    ompNumThreads: determinism.ompNumThreads,
    mklNumThreads: determinism.mklNumThreads,
    seed: determinism.seed,
    generatorPolicy: determinism.generatorPolicy,
    latentPolicy: determinism.latentPolicy,
  };
}

function assertBundleMatchesManifest(bundleBytes, manifest, label) {
  if (manifest.bundle.size !== bundleBytes.length || manifest.bundle.sha256 !== sha256(bundleBytes)) fail(`${label} bytes do not match canonical manifest`);
  const parsed = parseSafetensors(bundleBytes, label);
  for (const name of ['image_embeds','negative_image_embeds']) {
    const manifestTensor = manifest.bundle.tensors[name];
    const parsedTensor = parsed.tensors[name];
    if (manifestTensor.dtype !== parsedTensor.dtype || JSON.stringify(manifestTensor.shape) !== JSON.stringify(parsedTensor.shape)) fail(`${label} ${name} does not match canonical manifest`);
  }
  return parsed;
}

function parseSafetensors(bytes, label) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 9) fail(`${label} is too small for safetensors`);
  const headerLengthBig = bytes.readBigUInt64LE(0);
  if (headerLengthBig < 2n || headerLengthBig > BigInt(Number.MAX_SAFE_INTEGER)) fail(`${label} header length is invalid`);
  const headerLength = Number(headerLengthBig);
  const headerEnd = 8 + headerLength;
  if (headerEnd > bytes.length) fail(`${label} header exceeds file size`);
  let header;
  try { header = JSON.parse(bytes.subarray(8, headerEnd).toString('utf8')); }
  catch (error) { fail(`${label} header JSON is invalid: ${error.message}`); }
  exactKeys(header, ['image_embeds','negative_image_embeds'], `${label} header`);
  const data = bytes.subarray(headerEnd);
  const tensors = {};
  const ranges = [];
  for (const name of ['image_embeds','negative_image_embeds']) {
    const descriptor = header[name];
    exactKeys(descriptor, ['data_offsets','dtype','shape'], `${label} ${name} descriptor`);
    if (descriptor.dtype !== 'F32') fail(`${label} ${name} dtype must be F32`);
    if (!Array.isArray(descriptor.shape) || descriptor.shape.length < 1 || descriptor.shape.some(dimension => !Number.isSafeInteger(dimension) || dimension < 1)) fail(`${label} ${name} shape is invalid`);
    if (!Array.isArray(descriptor.data_offsets) || descriptor.data_offsets.length !== 2 || descriptor.data_offsets.some(offset => !Number.isSafeInteger(offset) || offset < 0)) fail(`${label} ${name} offsets are invalid`);
    const [start, end] = descriptor.data_offsets;
    const expectedBytes = descriptor.shape.reduce((product, dimension) => product * dimension, 1) * 4;
    if (!Number.isSafeInteger(expectedBytes) || end <= start || end > data.length || end - start !== expectedBytes) fail(`${label} ${name} byte range is invalid`);
    const tensorBytes = data.subarray(start, end);
    tensors[name] = { dtype: descriptor.dtype, shape: descriptor.shape, bytes: tensorBytes, sha256: sha256(tensorBytes) };
    ranges.push([start, end]);
  }
  ranges.sort((left, right) => left[0] - right[0]);
  if (ranges[0][0] !== 0 || ranges[0][1] !== ranges[1][0] || ranges[1][1] !== data.length) fail(`${label} tensor ranges must cover the data section exactly without gaps/overlap`);
  return { tensors };
}

function copyIdentity(value) {
  return Object.freeze({ path: value.path, size: value.size, sha256: value.sha256 });
}
function canonicalJson(value) {
  return Buffer.from(JSON.stringify(sortRecursively(value)), 'utf8');
}
function sortRecursively(value) {
  if (Array.isArray(value)) return value.map(sortRecursively);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortRecursively(value[key])]));
}
function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(`${label} keys are open or incomplete`);
}
function readJson(file, label) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(`${label} is invalid JSON: ${error.message}`); }
}
function readBytes(file, label) {
  try { return fs.readFileSync(file); }
  catch (error) { fail(`${label} cannot be read: ${error.message}`); }
}
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
function writeAtomic(file, bytes) {
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, bytes, { flag: 'wx' });
  fs.renameSync(temp, file);
}
function parseArgs(argv) {
  const allowed = new Set(['--d1','--prompt','--evidence','--bundle','--output','--positive-source-manifest','--positive-source-bundle']);
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || !value || value.startsWith('--')) fail('invalid D2c finalizer arguments');
    const normalized = key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (Object.hasOwn(values, normalized)) fail(`duplicate finalizer argument: ${key}`);
    values[normalized] = value;
  }
  for (const key of ['d1','prompt','evidence','bundle','output']) if (!values[key]) fail(`missing required finalizer argument: --${key}`);
  const sourcePair = [values.positiveSourceManifest, values.positiveSourceBundle];
  if (sourcePair.filter(Boolean).length === 1) fail('positive source manifest/bundle arguments must be supplied together');
  return values;
}
function fail(message) { throw new Error(message); }
