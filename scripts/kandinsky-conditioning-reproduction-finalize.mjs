#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertCanonicalManifestBytes,
  canonicalJsonBytes,
} from './kandinsky-conditioning-bundle-contract.mjs';
import { conditioningCandidateIdentity } from './kandinsky-conditioning-candidate-registry.mjs';

const MAX_JSON_BYTES = 1024 * 1024;
const MAX_BUNDLE_BYTES = 64 * 1024 * 1024;
const PRIOR_PIPELINE_GIT_BLOB_SHA1 = '3b9974a5dd70e8b775caa01efab6b637ff22d9e5';
const SHA256 = /^[0-9a-f]{64}$/;

const args = parseArgs(process.argv.slice(2));
const d1Bytes = readRealFile(args.d1, 'D1 manifest', MAX_JSON_BYTES);
const d1 = parseJson(d1Bytes, 'D1 manifest');
const d1Sha256 = sha256(d1Bytes);

assertDistinctBuildPaths(args);
const first = loadBuild('first build', args.firstManifest, args.firstBundle, args.firstEvidence, d1, d1Sha256);
const second = loadBuild('second build', args.secondManifest, args.secondBundle, args.secondEvidence, d1, d1Sha256);

if (!first.manifestBytes.equals(second.manifestBytes)) fail('conditioning manifests are not byte-identical across the two builds');
if (!first.bundleBytes.equals(second.bundleBytes)) fail('conditioning bundles are not byte-identical across the two builds');
if (!first.evidenceBytes.equals(second.evidenceBytes)) fail('builder evidence is not byte-identical across the two builds');
if (first.manifest.conditioning.candidateId !== second.manifest.conditioning.candidateId) fail('conditioning candidate differs across builds');

const candidateId = first.manifest.conditioning.candidateId;
const candidateIdentity = conditioningCandidateIdentity(candidateId);
const positiveEmbeddingSource = validatePositiveSource({
  args,
  d1,
  candidateId,
  candidateIdentity,
  target: first,
  firstEvidence: first.evidence,
  secondEvidence: second.evidence,
});

const record = Object.freeze({
  schemaVersion: 1,
  stage: 'F5B1_D2_CONDITIONING_REPRODUCTION',
  status: 'TWO_BUILD_BYTE_IDENTICAL_RESEARCH_EVIDENCE',
  productionExecutable: false,
  runtimeAuthorityGranted: false,
  priorRuntimeDependencyAllowed: false,
  candidateId,
  conditioningContractSha256: first.manifest.conditioning.conditioningContractSha256,
  d1ManifestSha256: d1Sha256,
  buildCount: 2,
  conditioningManifest: Object.freeze({
    size: first.manifestBytes.length,
    sha256: sha256(first.manifestBytes),
  }),
  builderEvidence: Object.freeze({
    size: first.evidenceBytes.length,
    sha256: sha256(first.evidenceBytes),
  }),
  bundle: Object.freeze({
    size: first.bundleBytes.length,
    sha256: sha256(first.bundleBytes),
    tensors: Object.freeze({
      image_embeds: tensorRecord(first.parsed.tensors.image_embeds),
      negative_image_embeds: tensorRecord(first.parsed.tensors.negative_image_embeds),
    }),
  }),
  positiveEmbeddingSource,
});

const output = canonicalJsonBytes(record);
writeAtomic(args.output, output);
process.stdout.write(`${JSON.stringify({
  status: record.status,
  candidateId,
  output: args.output,
  reproductionSha256: sha256(output),
})}\n`);

function loadBuild(label, manifestPath, bundlePath, evidencePath, d1Manifest, d1ManifestSha256) {
  const manifestBytes = readRealFile(manifestPath, `${label} conditioning manifest`, MAX_JSON_BYTES);
  const manifest = assertCanonicalManifestBytes(manifestBytes, d1Manifest);
  const bundleBytes = readRealFile(bundlePath, `${label} conditioning bundle`, MAX_BUNDLE_BYTES);
  const parsed = assertBundleMatchesManifest(bundleBytes, manifest, `${label} conditioning bundle`);
  const evidenceBytes = readRealFile(evidencePath, `${label} builder evidence`, MAX_JSON_BYTES);
  const evidence = assertCanonicalBuilderEvidence(evidenceBytes, {
    label,
    d1ManifestSha256,
    manifest,
    parsed,
    bundleBytes,
  });
  return Object.freeze({ manifestBytes, manifest, bundleBytes, parsed, evidenceBytes, evidence });
}

function assertCanonicalBuilderEvidence(bytes, context) {
  const value = parseJson(bytes, `${context.label} builder evidence`);
  const canonical = canonicalJsonBytes(value);
  if (!bytes.equals(canonical)) fail(`${context.label} builder evidence is not canonical JSON`);
  exactKeys(value, [
    'schemaVersion', 'stage', 'status', 'candidateId', 'conditioningContractSha256', 'positiveEmbeddingSource',
    'sourceTrust', 'toolchain', 'determinism', 'bundle',
  ], `${context.label} builder evidence`);
  if (value.schemaVersion !== 1 || value.stage !== 'F5B1_D2C_CONDITIONING_BUILD' || value.status !== 'BUILT_NOT_ADMITTED') {
    fail(`${context.label} builder evidence stage/status mismatch`);
  }
  if (value.candidateId !== context.manifest.conditioning.candidateId) fail(`${context.label} builder evidence candidate mismatch`);
  if (value.conditioningContractSha256 !== context.manifest.conditioning.conditioningContractSha256) fail(`${context.label} builder evidence conditioning identity mismatch`);

  exactKeys(value.sourceTrust, [
    'd1ManifestSha256', 'd1ModelId', 'd1Version', 'priorRepository', 'priorRevision', 'priorPipelineGitBlobSha1',
  ], `${context.label} sourceTrust`);
  if (value.sourceTrust.d1ManifestSha256 !== context.d1ManifestSha256 || !SHA256.test(value.sourceTrust.d1ManifestSha256)) {
    fail(`${context.label} builder evidence is not bound to the exact D1 manifest bytes`);
  }
  for (const [evidenceKey, manifestKey] of [
    ['d1ModelId', 'd1ModelId'], ['d1Version', 'd1Version'], ['priorRepository', 'priorRepository'], ['priorRevision', 'priorRevision'],
  ]) {
    if (value.sourceTrust[evidenceKey] !== context.manifest.sourceTrust[manifestKey]) fail(`${context.label} builder source trust mismatch`);
  }
  if (value.sourceTrust.priorPipelineGitBlobSha1 !== PRIOR_PIPELINE_GIT_BLOB_SHA1) fail(`${context.label} historical prior source mismatch`);

  exactKeys(value.toolchain, [
    'schemaVersion', 'status', 'containerImageDigest', 'pythonVersion', 'diffusersVersion', 'torchVersion',
    'transformersVersion', 'numpyVersion', 'safetensorsVersion', 'platformMachine',
  ], `${context.label} toolchain`);
  if (value.toolchain.schemaVersion !== 1 || value.toolchain.status !== 'TESTED_EXACT') fail(`${context.label} toolchain is not tested/exact`);
  assertCanonicalSubset(value.toolchain, context.manifest.toolchain, ['containerImageDigest','pythonVersion','diffusersVersion','torchVersion','transformersVersion','numpyVersion','safetensorsVersion','platformMachine'], `${context.label} toolchain`);

  exactKeys(value.determinism, [
    'device', 'outputDtype', 'torchDeterministicAlgorithms', 'numThreads', 'numInteropThreads', 'ompNumThreads',
    'mklNumThreads', 'seed', 'generatorPolicy', 'latentPolicy', 'networkPolicy',
  ], `${context.label} determinism`);
  assertCanonicalSubset(value.determinism, context.manifest.determinism, ['device','outputDtype','torchDeterministicAlgorithms','numThreads','numInteropThreads','ompNumThreads','mklNumThreads','seed','generatorPolicy','latentPolicy'], `${context.label} determinism`);
  if (value.determinism.networkPolicy !== 'CONTAINER_NETWORK_NONE_PLUS_LIBRARY_OFFLINE_GUARD') fail(`${context.label} network policy mismatch`);

  exactKeys(value.bundle, ['format','metadataPolicy','tensorOrder','tensors','size','sha256'], `${context.label} bundle`);
  if (value.bundle.format !== 'safetensors' || value.bundle.metadataPolicy !== 'NONE') fail(`${context.label} bundle format mismatch`);
  if (JSON.stringify(value.bundle.tensorOrder) !== JSON.stringify(['image_embeds','negative_image_embeds'])) fail(`${context.label} tensor order mismatch`);
  if (value.bundle.size !== context.bundleBytes.length || value.bundle.sha256 !== sha256(context.bundleBytes)) fail(`${context.label} bundle identity mismatch`);
  exactKeys(value.bundle.tensors, ['image_embeds','negative_image_embeds'], `${context.label} bundle tensors`);
  for (const name of ['image_embeds','negative_image_embeds']) {
    const actual = value.bundle.tensors[name];
    const parsed = context.parsed.tensors[name];
    exactKeys(actual, ['dtype','shape','sha256'], `${context.label} ${name} evidence`);
    if (actual.dtype !== parsed.dtype || JSON.stringify(actual.shape) !== JSON.stringify(parsed.shape) || actual.sha256 !== parsed.sha256) fail(`${context.label} ${name} evidence mismatch`);
    const manifestTensor = context.manifest.bundle.tensors[name];
    if (manifestTensor.dtype !== parsed.dtype || JSON.stringify(manifestTensor.shape) !== JSON.stringify(parsed.shape)) fail(`${context.label} ${name} manifest mismatch`);
  }
  return value;
}

function validatePositiveSource({ args, d1, candidateId, candidateIdentity, target, firstEvidence, secondEvidence }) {
  const expected = candidateIdentity.positiveEmbeddingSourceCandidateId;
  const hasManifest = typeof args.positiveSourceManifest === 'string';
  const hasBundle = typeof args.positiveSourceBundle === 'string';
  if (expected === null) {
    if (hasManifest || hasBundle) fail(`${candidateId} forbids positive-source inputs`);
    if (firstEvidence.positiveEmbeddingSource !== null || secondEvidence.positiveEmbeddingSource !== null) fail(`${candidateId} builder evidence must not claim a positive source`);
    return null;
  }
  if (!hasManifest || !hasBundle) fail(`${candidateId} requires the accepted positive-source manifest and bundle`);

  const sourceManifestBytes = readRealFile(args.positiveSourceManifest, 'positive source manifest', MAX_JSON_BYTES);
  const sourceManifest = assertCanonicalManifestBytes(sourceManifestBytes, d1);
  if (sourceManifest.conditioning.candidateId !== expected) fail('positive source candidate mismatch');
  const sourceIdentity = conditioningCandidateIdentity(expected);
  if (sourceManifest.conditioning.conditioningContractSha256 !== sourceIdentity.conditioningContractSha256) fail('positive source conditioning identity mismatch');
  if (canonicalObject(sourceManifest.toolchain) !== canonicalObject(target.manifest.toolchain)) fail('positive source toolchain differs from target build');
  if (canonicalObject(sourceManifest.determinism) !== canonicalObject(target.manifest.determinism)) fail('positive source determinism differs from target build');

  const sourceBundleBytes = readRealFile(args.positiveSourceBundle, 'positive source bundle', MAX_BUNDLE_BYTES);
  const sourceParsed = assertBundleMatchesManifest(sourceBundleBytes, sourceManifest, 'positive source bundle');
  const sourceImage = sourceParsed.tensors.image_embeds;
  const targetImage = target.parsed.tensors.image_embeds;
  if (!sourceImage.bytes.equals(targetImage.bytes)) fail('target image_embeds are not byte-identical to the accepted positive source');

  const expectedEvidence = Object.freeze({
    candidateId: expected,
    conditioningContractSha256: sourceIdentity.conditioningContractSha256,
    manifestSha256: sha256(sourceManifestBytes),
    bundleSize: sourceBundleBytes.length,
    bundleSha256: sha256(sourceBundleBytes),
    imageEmbedsSha256: sourceImage.sha256,
  });
  for (const [label, evidence] of [['first', firstEvidence], ['second', secondEvidence]]) {
    const claimed = evidence.positiveEmbeddingSource;
    exactKeys(claimed, ['candidateId','conditioningContractSha256','manifestSha256','bundleSize','bundleSha256','imageEmbedsSha256'], `${label} build positiveEmbeddingSource`);
    if (canonicalObject(claimed) !== canonicalObject(expectedEvidence)) fail(`${label} build positive source provenance mismatch`);
  }
  return expectedEvidence;
}

function assertBundleMatchesManifest(bytes, manifest, label) {
  if (manifest.bundle.size !== bytes.length || manifest.bundle.sha256 !== sha256(bytes)) fail(`${label} bytes do not match manifest`);
  const parsed = parseSafetensors(bytes, label);
  for (const name of ['image_embeds','negative_image_embeds']) {
    const expected = manifest.bundle.tensors[name];
    const actual = parsed.tensors[name];
    if (expected.dtype !== actual.dtype || JSON.stringify(expected.shape) !== JSON.stringify(actual.shape)) fail(`${label} ${name} shape/dtype mismatch`);
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
  const header = parseJson(bytes.subarray(8, headerEnd), `${label} header`);
  exactKeys(header, ['image_embeds','negative_image_embeds'], `${label} header`);
  const data = bytes.subarray(headerEnd);
  const tensors = {};
  const ranges = [];
  for (const name of ['image_embeds','negative_image_embeds']) {
    const descriptor = header[name];
    exactKeys(descriptor, ['data_offsets','dtype','shape'], `${label} ${name} descriptor`);
    if (descriptor.dtype !== 'F32') fail(`${label} ${name} dtype must be F32`);
    if (!Array.isArray(descriptor.shape) || descriptor.shape.length < 1 || descriptor.shape.some(value => !Number.isSafeInteger(value) || value < 1)) fail(`${label} ${name} shape is invalid`);
    if (!Array.isArray(descriptor.data_offsets) || descriptor.data_offsets.length !== 2 || descriptor.data_offsets.some(value => !Number.isSafeInteger(value) || value < 0)) fail(`${label} ${name} offsets are invalid`);
    const [start, end] = descriptor.data_offsets;
    const expectedBytes = descriptor.shape.reduce((product, value) => product * value, 1) * 4;
    if (!Number.isSafeInteger(expectedBytes) || end <= start || end > data.length || end - start !== expectedBytes) fail(`${label} ${name} byte range is invalid`);
    const tensorBytes = data.subarray(start, end);
    tensors[name] = Object.freeze({ dtype: descriptor.dtype, shape: Object.freeze([...descriptor.shape]), bytes: tensorBytes, sha256: sha256(tensorBytes) });
    ranges.push([start, end]);
  }
  ranges.sort((left, right) => left[0] - right[0]);
  if (ranges[0][0] !== 0 || ranges[0][1] !== ranges[1][0] || ranges[1][1] !== data.length) fail(`${label} tensor ranges must cover data exactly`);
  return Object.freeze({ tensors: Object.freeze(tensors) });
}

function tensorRecord(tensor) {
  return Object.freeze({ dtype: tensor.dtype, shape: Object.freeze([...tensor.shape]), sha256: tensor.sha256 });
}

function assertDistinctBuildPaths(argsValue) {
  for (const [kind, firstPath, secondPath] of [
    ['manifest', argsValue.firstManifest, argsValue.secondManifest],
    ['bundle', argsValue.firstBundle, argsValue.secondBundle],
    ['evidence', argsValue.firstEvidence, argsValue.secondEvidence],
  ]) {
    if (fs.realpathSync(firstPath) === fs.realpathSync(secondPath)) fail(`two-build ${kind} inputs must be distinct files`);
  }
}

function parseArgs(argv) {
  const known = new Set(['--d1','--first-manifest','--first-bundle','--first-evidence','--second-manifest','--second-bundle','--second-evidence','--positive-source-manifest','--positive-source-bundle','--output']);
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!known.has(flag) || typeof value !== 'string' || value.startsWith('--') || Object.hasOwn(values, flag)) fail('reproduction finalizer arguments are malformed or duplicated');
    values[flag] = value;
  }
  for (const required of ['--d1','--first-manifest','--first-bundle','--first-evidence','--second-manifest','--second-bundle','--second-evidence','--output']) {
    if (!Object.hasOwn(values, required)) fail(`missing required argument ${required}`);
  }
  if (Object.hasOwn(values, '--positive-source-manifest') !== Object.hasOwn(values, '--positive-source-bundle')) fail('positive-source manifest and bundle must be supplied together');
  return Object.freeze({
    d1: values['--d1'],
    firstManifest: values['--first-manifest'],
    firstBundle: values['--first-bundle'],
    firstEvidence: values['--first-evidence'],
    secondManifest: values['--second-manifest'],
    secondBundle: values['--second-bundle'],
    secondEvidence: values['--second-evidence'],
    positiveSourceManifest: values['--positive-source-manifest'],
    positiveSourceBundle: values['--positive-source-bundle'],
    output: values['--output'],
  });
}

function readRealFile(filePath, label, maxBytes) {
  const candidate = path.resolve(filePath);
  const stat = fs.lstatSync(candidate);
  if (stat.isSymbolicLink() || !stat.isFile()) fail(`${label} must be a real regular file`);
  if (stat.size < 1 || stat.size > maxBytes) fail(`${label} size is outside the accepted bound`);
  return fs.readFileSync(candidate);
}

function parseJson(bytes, label) {
  let value;
  try {
    const text = Buffer.from(bytes).toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(Buffer.from(bytes))) fail(`${label} is not valid UTF-8`);
    value = JSON.parse(text);
  } catch (error) {
    fail(`${label} JSON is invalid: ${error.message}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || wanted.some((key, index) => actual[index] !== key)) fail(`${label} keys are outside the closed schema`);
}

function assertCanonicalSubset(source, target, keys, label) {
  const sourceSubset = Object.fromEntries(keys.map(key => [key, source[key]]));
  const targetSubset = Object.fromEntries(keys.map(key => [key, target[key]]));
  if (canonicalObject(sourceSubset) !== canonicalObject(targetSubset)) fail(`${label} differs from conditioning manifest`);
}

function canonicalObject(value) {
  return JSON.stringify(sortRecursively(value));
}

function sortRecursively(value) {
  if (Array.isArray(value)) return value.map(sortRecursively);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortRecursively(value[key])]));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function writeAtomic(destination, bytes) {
  const target = path.resolve(destination);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    fs.writeFileSync(temp, bytes, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temp, target);
  } finally {
    try { fs.unlinkSync(temp); } catch {}
  }
}

function fail(message) {
  throw new Error(message);
}
