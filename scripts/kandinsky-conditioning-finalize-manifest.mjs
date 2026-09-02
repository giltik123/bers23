#!/usr/bin/env node
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

const expectedPrompt = conditioningPromptContract(prompt.candidateId);
const candidateIdentity = conditioningCandidateIdentity(prompt.candidateId);
const promptBytes = canonicalJson(prompt);
const expectedPromptBytes = canonicalJson(expectedPrompt.contract);
if (!promptBytes.equals(expectedPromptBytes)) fail('D2c prompt contract bytes do not match the accepted D2b candidate');
if (evidence.conditioningContractSha256 !== expectedPrompt.sha256) fail('D2c evidence is not bound to the accepted D2b prompt contract');

assertEvidence(evidence, prompt.candidateId, candidateIdentity);
assertPositiveSource(evidence, candidateIdentity);
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
  toolchain: Object.freeze({
    containerImageDigest: evidence.toolchain.containerImageDigest,
    pythonVersion: evidence.toolchain.pythonVersion,
    diffusersVersion: evidence.toolchain.diffusersVersion,
    torchVersion: evidence.toolchain.torchVersion,
    transformersVersion: evidence.toolchain.transformersVersion,
    numpyVersion: evidence.toolchain.numpyVersion,
    safetensorsVersion: evidence.toolchain.safetensorsVersion,
    platformMachine: evidence.toolchain.platformMachine,
  }),
  determinism: Object.freeze({
    device: evidence.determinism.device,
    outputDtype: evidence.determinism.outputDtype,
    torchDeterministicAlgorithms: evidence.determinism.torchDeterministicAlgorithms,
    numThreads: evidence.determinism.numThreads,
    numInteropThreads: evidence.determinism.numInteropThreads,
    ompNumThreads: evidence.determinism.ompNumThreads,
    mklNumThreads: evidence.determinism.mklNumThreads,
    seed: evidence.determinism.seed,
    generatorPolicy: evidence.determinism.generatorPolicy,
    latentPolicy: evidence.determinism.latentPolicy,
  }),
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
      image_embeds: Object.freeze({ ...evidence.bundle.tensors.image_embeds, shape: Object.freeze([...evidence.bundle.tensors.image_embeds.shape]) }),
      negative_image_embeds: Object.freeze({ ...evidence.bundle.tensors.negative_image_embeds, shape: Object.freeze([...evidence.bundle.tensors.negative_image_embeds.shape]) }),
    }),
    size: evidence.bundle.size,
    sha256: evidence.bundle.sha256,
  }),
});

assertKandinskyConditioningManifest(manifest, d1);
const output = canonicalJsonBytes(manifest);
fs.mkdirSync(path.dirname(args.output), { recursive: true });
writeAtomic(args.output, output);
process.stdout.write(`${JSON.stringify({ status: 'FINALIZED_RESEARCH_MANIFEST', candidateId: prompt.candidateId, manifestSha256: sha256Bytes(output), output: args.output })}\n`);

function assertEvidence(value, candidateId, identity) {
  const baseKeys = ['schemaVersion','stage','status','candidateId','conditioningContractSha256','sourceTrust','toolchain','determinism','bundle'];
  const expectedKeys = identity.positiveEmbeddingSourceCandidateId ? [...baseKeys, 'composition'] : baseKeys;
  exactKeys(value, expectedKeys, 'builder evidence');
  if (value.schemaVersion !== 1 || value.stage !== 'F5B1_D2C_CONDITIONING_BUILD' || value.status !== 'BUILT_NOT_ADMITTED') fail('builder evidence stage/status mismatch');
  if (value.candidateId !== candidateId) fail('builder evidence candidate mismatch');
  if (!/^[0-9a-f]{64}$/.test(value.conditioningContractSha256)) fail('builder evidence conditioning SHA is invalid');
  exactKeys(value.sourceTrust, ['d1ModelId','d1Version','priorRepository','priorRevision','priorPipelineGitBlobSha1'], 'builder evidence sourceTrust');
  if (value.sourceTrust.d1ModelId !== d1.modelId || value.sourceTrust.d1Version !== d1.version || value.sourceTrust.priorRepository !== d1.offlinePrior.repository || value.sourceTrust.priorRevision !== d1.offlinePrior.revision) fail('builder evidence source trust mismatch');
  if (value.sourceTrust.priorPipelineGitBlobSha1 !== '3b9974a5dd70e8b775caa01efab6b637ff22d9e5') fail('builder evidence historical prior source mismatch');
  exactKeys(value.toolchain, ['schemaVersion','status','containerImageDigest','pythonVersion','diffusersVersion','torchVersion','transformersVersion','numpyVersion','safetensorsVersion','platformMachine'], 'builder evidence toolchain');
  if (value.toolchain.schemaVersion !== 1 || value.toolchain.status !== 'TESTED_EXACT') fail('builder evidence toolchain is not tested/exact');
  exactKeys(value.determinism, ['device','outputDtype','torchDeterministicAlgorithms','numThreads','numInteropThreads','ompNumThreads','mklNumThreads','seed','generatorPolicy','latentPolicy','networkPolicy'], 'builder evidence determinism');
  if (value.determinism.networkPolicy !== 'CONTAINER_NETWORK_NONE_PLUS_LIBRARY_OFFLINE_GUARD') fail('builder evidence network isolation mismatch');
  exactKeys(value.bundle, ['format','metadataPolicy','tensorOrder','tensors','size','sha256'], 'builder evidence bundle');
  if (value.bundle.format !== 'safetensors' || value.bundle.metadataPolicy !== 'NONE') fail('builder evidence bundle format mismatch');
  if (JSON.stringify(value.bundle.tensorOrder) !== JSON.stringify(['image_embeds','negative_image_embeds'])) fail('builder evidence tensor order mismatch');
  if (!Number.isSafeInteger(value.bundle.size) || value.bundle.size < 1 || !/^[0-9a-f]{64}$/.test(value.bundle.sha256)) fail('builder evidence bundle identity is invalid');
}

function assertPositiveSource(evidence, identity) {
  const sourceCandidateId = identity.positiveEmbeddingSourceCandidateId;
  if (!sourceCandidateId) {
    if (args.positiveSourceManifest || args.positiveSourceBundle) fail('positive-source files are forbidden for a self-generated positive candidate');
    return;
  }
  if (!args.positiveSourceManifest || !args.positiveSourceBundle) fail('candidate requires positive-source manifest and bundle');
  const sourceManifestBytes = fs.readFileSync(args.positiveSourceManifest);
  const sourceManifest = assertCanonicalManifestBytes(sourceManifestBytes, d1);
  const sourceIdentity = conditioningCandidateIdentity(sourceCandidateId);
  if (sourceManifest.conditioning.candidateId !== sourceCandidateId || sourceManifest.conditioning.conditioningContractSha256 !== sourceIdentity.conditioningContractSha256) fail('positive-source manifest candidate identity mismatch');
  const sourceBundleBytes = fs.readFileSync(args.positiveSourceBundle);
  if (sourceManifest.bundle.size !== sourceBundleBytes.byteLength || sourceManifest.bundle.sha256 !== sha256Bytes(sourceBundleBytes)) fail('positive-source bundle identity does not match its accepted manifest');

  const composition = evidence.composition;
  exactKeys(composition, ['policy','positiveSource','negativeSource'], 'builder evidence composition');
  if (composition.policy !== 'REUSE_POSITIVE_FROM_ACCEPTED_CANDIDATE') fail('builder evidence composition policy mismatch');
  exactKeys(composition.positiveSource, ['candidateId','conditioningContractSha256','manifestSha256','bundleSize','bundleSha256','imageEmbedsSha256'], 'builder evidence positiveSource');
  exactKeys(composition.negativeSource, ['candidateId','conditioningContractSha256','rawBundleSize','rawBundleSha256','discardedRawImageEmbedsSha256','negativeImageEmbedsSha256'], 'builder evidence negativeSource');
  const expectedManifestSha = sha256Bytes(sourceManifestBytes);
  if (composition.positiveSource.candidateId !== sourceCandidateId || composition.positiveSource.conditioningContractSha256 !== sourceIdentity.conditioningContractSha256 || composition.positiveSource.manifestSha256 !== expectedManifestSha || composition.positiveSource.bundleSize !== sourceBundleBytes.byteLength || composition.positiveSource.bundleSha256 !== sourceManifest.bundle.sha256) fail('builder evidence positive-source provenance mismatch');
  assertSha(composition.positiveSource.imageEmbedsSha256, 'builder evidence positiveSource.imageEmbedsSha256');
  if (composition.negativeSource.candidateId !== evidence.candidateId || composition.negativeSource.conditioningContractSha256 !== evidence.conditioningContractSha256) fail('builder evidence negative-source candidate mismatch');
  if (!Number.isSafeInteger(composition.negativeSource.rawBundleSize) || composition.negativeSource.rawBundleSize < 1) fail('builder evidence raw C bundle size is invalid');
  for (const key of ['rawBundleSha256','discardedRawImageEmbedsSha256','negativeImageEmbedsSha256']) assertSha(composition.negativeSource[key], `builder evidence negativeSource.${key}`);
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
function assertSha(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) fail(`${label} must be lowercase SHA-256`);
}
function readJson(file, label) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(`${label} is invalid JSON: ${error.message}`); }
}
function writeAtomic(file, bytes) {
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, bytes, { flag: 'wx' });
  fs.renameSync(temp, file);
}
function parseArgs(argv) {
  const accepted = new Set(['--d1','--prompt','--evidence','--output','--positive-source-manifest','--positive-source-bundle']);
  const values = {};
  if (argv.length % 2 !== 0) fail('finalizer arguments must be flag/value pairs');
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    const normalized = typeof key === 'string' ? key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()) : '';
    if (!accepted.has(key) || !value || Object.hasOwn(values, normalized)) fail('finalizer arguments are invalid or duplicated');
    values[normalized] = value;
  }
  for (const required of ['d1','prompt','evidence','output']) if (!values[required]) fail('all base finalizer arguments are required exactly once');
  const sourceCount = Number(Boolean(values.positiveSourceManifest)) + Number(Boolean(values.positiveSourceBundle));
  if (sourceCount === 1) fail('positive-source manifest and bundle must be supplied together');
  return values;
}
function fail(message) { throw new Error(message); }
