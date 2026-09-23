import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const scriptUrl = new URL('../scripts/inspect-hsme-teacher-snapshot.py', import.meta.url);
const scriptPath = scriptUrl.pathname;
const script = await readFile(scriptUrl, 'utf8');
const R = char => char.repeat(40);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hf = (sourceRoot, immutableRevision) => ({ provider: 'HUGGING_FACE', sourceRoot, immutableRevision });

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function domainDigest(domain, value) {
  return createHash('sha256').update(`${domain}\0${JSON.stringify(canonical(value))}`).digest('hex');
}

function runInspector(args) {
  return spawnSync('python3', [scriptPath, ...args], { encoding: 'utf8' });
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hsme-teacher-acquisition-'));
  const materialized = join(root, 'materialized');
  const primaryDir = join(materialized, 'primary');
  const dependencyDir = join(materialized, 'dependency');
  await mkdir(join(primaryDir, 'transformer'), { recursive: true });
  await mkdir(join(primaryDir, 'scheduler'), { recursive: true });
  await mkdir(join(dependencyDir, 'text_encoder'), { recursive: true });

  const denoiser = Buffer.from('fixture-denoiser-weights');
  const scheduler = Buffer.from('{"fixture":true}\n');
  const textEncoder = Buffer.from('fixture-text-encoder-weights');
  await writeFile(join(primaryDir, 'transformer', 'model.safetensors'), denoiser);
  await writeFile(join(primaryDir, 'scheduler', 'scheduler_config.json'), scheduler);
  await writeFile(join(dependencyDir, 'text_encoder', 'model.safetensors'), textEncoder);

  const primary = hf('Qwen/Qwen-Image-2512', R('a'));
  const dependency = hf('Qwen/Qwen2.5-VL-7B-Instruct', R('b'));
  const plan = {
    schemaVersion: 'BERS_HSME_TEACHER_ACQUISITION_PLAN_V1',
    teacherCandidateId: 'qwen-image-2512-quality-teacher',
    primarySource: primary,
    sources: [
      { source: dependency, materializedSubdir: 'dependency' },
      { source: primary, materializedSubdir: 'primary' },
    ],
    artifacts: [
      { logicalId: 'text-encoder-0001', source: dependency, relativePath: 'text_encoder/model.safetensors', role: 'TEXT_ENCODER_WEIGHT', runtimeRequired: true },
      { logicalId: 'scheduler-config', source: primary, relativePath: 'scheduler/scheduler_config.json', role: 'SCHEDULER_ASSET', runtimeRequired: true },
      { logicalId: 'denoiser-0001', source: primary, relativePath: 'transformer/model.safetensors', role: 'DENOISER_WEIGHT', runtimeRequired: true },
    ],
  };

  const planPath = join(root, 'plan.json');
  const manifestPath = join(root, 'manifest.json');
  const evidencePath = join(root, 'evidence.json');
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  return { root, materialized, primaryDir, dependencyDir, denoiser, scheduler, textEncoder, plan, planPath, manifestPath, evidencePath };
}

test('inspector hashes exact multi-source bytes before any model deserialization and reproduces the TypeScript manifest digest domain', async () => {
  const f = await fixture();
  const result = runInspector([
    '--plan', f.planPath,
    '--materialized-root', f.materialized,
    '--manifest-output', f.manifestPath,
    '--evidence-output', f.evidencePath,
  ]);
  assert.equal(result.status, 0, result.stderr);

  const manifest = JSON.parse(await readFile(f.manifestPath, 'utf8'));
  const evidence = JSON.parse(await readFile(f.evidencePath, 'utf8'));
  assert.equal(manifest.schemaVersion, 'BERS_HSME_TEACHER_ARTIFACT_MANIFEST_V1');
  assert.deepEqual(manifest.artifacts.map(value => value.logicalId), ['denoiser-0001', 'scheduler-config', 'text-encoder-0001']);
  assert.equal(manifest.artifacts.find(value => value.logicalId === 'denoiser-0001').contentSha256, sha(f.denoiser));
  assert.equal(manifest.artifacts.find(value => value.logicalId === 'denoiser-0001').bytes, f.denoiser.length);
  assert.equal(manifest.artifacts.find(value => value.logicalId === 'text-encoder-0001').contentSha256, sha(f.textEncoder));
  assert.equal(manifest.artifacts.find(value => value.logicalId === 'text-encoder-0001').bytes, f.textEncoder.length);
  assert.equal(evidence.manifestDigest, domainDigest('bers:hsme:teacher-artifact-manifest:v1', manifest));
  assert.equal(evidence.artifactCount, 3);
  assert.equal(evidence.sourceCount, 2);
  assert.equal(evidence.hashBeforeDeserialization, true);
  assert.equal(evidence.deserializationPerformed, false);
  assert.equal(evidence.modelRepositoryRuntimeCodeExecuted, false);
  assert.equal(evidence.binaryPayloadPublished, false);
  assert.equal(evidence.runtimeAuthorityGranted, false);
});

test('expected manifest reproduction passes only while acquired bytes remain exact', async () => {
  const f = await fixture();
  let result = runInspector([
    '--plan', f.planPath,
    '--materialized-root', f.materialized,
    '--manifest-output', f.manifestPath,
    '--evidence-output', f.evidencePath,
  ]);
  assert.equal(result.status, 0, result.stderr);

  const reproducedPath = join(f.root, 'manifest-reproduced.json');
  const reproducedEvidence = join(f.root, 'evidence-reproduced.json');
  result = runInspector([
    '--plan', f.planPath,
    '--materialized-root', f.materialized,
    '--manifest-output', reproducedPath,
    '--evidence-output', reproducedEvidence,
    '--expected-manifest', f.manifestPath,
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(await readFile(reproducedEvidence, 'utf8')).matchesExpectedManifest, true);

  await writeFile(join(f.primaryDir, 'transformer', 'model.safetensors'), Buffer.from('drifted-model-bytes'));
  result = runInspector([
    '--plan', f.planPath,
    '--materialized-root', f.materialized,
    '--manifest-output', reproducedPath,
    '--evidence-output', reproducedEvidence,
    '--expected-manifest', f.manifestPath,
  ]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /teacher snapshot identity mismatch/);
});

test('symlinked runtime files are rejected before hashing', async () => {
  const f = await fixture();
  const real = join(f.primaryDir, 'transformer', 'real.safetensors');
  const linked = join(f.primaryDir, 'transformer', 'model.safetensors');
  await writeFile(real, Buffer.from('replacement'));
  await import('node:fs/promises').then(({ unlink }) => unlink(linked));
  await symlink(real, linked);

  const result = runInspector([
    '--plan', f.planPath,
    '--materialized-root', f.materialized,
    '--manifest-output', f.manifestPath,
    '--evidence-output', f.evidencePath,
  ]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /symlinked teacher artifact path rejected/);
});

test('model-repository runtime code and unsafe paths fail closed at acquisition-plan normalization', async () => {
  const f = await fixture();
  const runtimeCode = structuredClone(f.plan);
  runtimeCode.artifacts[0].role = 'RUNTIME_CODE';
  const runtimeCodePlan = join(f.root, 'runtime-code-plan.json');
  await writeFile(runtimeCodePlan, `${JSON.stringify(runtimeCode)}\n`);
  let result = runInspector([
    '--plan', runtimeCodePlan,
    '--materialized-root', f.materialized,
    '--manifest-output', f.manifestPath,
    '--evidence-output', f.evidencePath,
  ]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /runtime code.*fails closed/i);

  const traversal = structuredClone(f.plan);
  traversal.artifacts[0].relativePath = '../escape.safetensors';
  const traversalPlan = join(f.root, 'traversal-plan.json');
  await writeFile(traversalPlan, `${JSON.stringify(traversal)}\n`);
  result = runInspector([
    '--plan', traversalPlan,
    '--materialized-root', f.materialized,
    '--manifest-output', f.manifestPath,
    '--evidence-output', f.evidencePath,
  ]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unsafe path segments/);
});

test('inspector remains a hashing/inventory tool and never imports model deserializers', () => {
  assert.match(script, /hashlib\.sha256/);
  assert.match(script, /O_NOFOLLOW/);
  assert.match(script, /hashBeforeDeserialization/);
  assert.match(script, /deserializationPerformed.*False/);
  assert.doesNotMatch(script, /torch\.load/);
  assert.doesNotMatch(script, /pickle\.load/);
  assert.doesNotMatch(script, /from_pretrained/);
  assert.doesNotMatch(script, /transformers/);
});
