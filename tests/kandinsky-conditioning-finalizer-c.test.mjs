import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  assertKandinskyConditioningManifest,
  canonicalJsonBytes,
  sha256Bytes,
} from '../scripts/kandinsky-conditioning-bundle-contract.mjs';
import { conditioningCandidateIdentity } from '../scripts/kandinsky-conditioning-candidate-registry.mjs';
import { conditioningPromptContract } from '../scripts/kandinsky-conditioning-prompt-contract.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const FINALIZER = path.join(ROOT, 'scripts/kandinsky-conditioning-finalize-manifest.mjs');
const D1_PATH = path.join(ROOT, 'src/platform/creative/local-ai/models/kandinsky-2-2-refinement-feasibility.manifest.json');
const C_ID = 'C_PRESERVATION_EXPLICIT_NEGATIVE';
const B_ID = 'B_REALISM_ZERO_NEGATIVE';

test('D2c C finalizer requires and revalidates actual C bytes plus the accepted B positive source', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bers-kandinsky-d2c-finalizer-c-'));
  try {
    const d1 = JSON.parse(fs.readFileSync(D1_PATH, 'utf8'));
    const sourceBundle = path.join(temp, 'B.conditioning.safetensors');
    const sourceBytes = Buffer.from('synthetic-b-bundle-identity', 'utf8');
    fs.writeFileSync(sourceBundle, sourceBytes);
    const sourceManifestValue = conditioningManifest(d1, B_ID, sourceBytes.length, sha256Bytes(sourceBytes));
    assertKandinskyConditioningManifest(sourceManifestValue, d1);
    const sourceManifestBytes = canonicalJsonBytes(sourceManifestValue);
    const sourceManifest = path.join(temp, 'B.manifest.json');
    fs.writeFileSync(sourceManifest, sourceManifestBytes);

    const finalBundleBytes = Buffer.from('synthetic-final-c-bundle', 'utf8');
    const finalBundle = path.join(temp, 'C.conditioning.safetensors');
    fs.writeFileSync(finalBundle, finalBundleBytes);
    const promptContract = conditioningPromptContract(C_ID);
    const prompt = path.join(temp, 'C.prompt.json');
    fs.writeFileSync(prompt, JSON.stringify(promptContract.contract));
    const evidence = path.join(temp, 'C.evidence.json');
    fs.writeFileSync(evidence, JSON.stringify(cEvidence(d1, promptContract.sha256, sourceManifestBytes, sourceBytes, finalBundleBytes)));

    const output = path.join(temp, 'C.manifest.json');
    const success = runFinalizer({ prompt, evidence, bundle: finalBundle, output, sourceManifest, sourceBundle });
    assert.equal(success.status, 0, success.stderr);
    const finalized = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(finalized.conditioning.candidateId, C_ID);
    assert.equal(finalized.conditioning.conditioningContractSha256, conditioningCandidateIdentity(C_ID).conditioningContractSha256);
    assert.equal(finalized.bundle.sha256, sha256Bytes(finalBundleBytes));
    assertKandinskyConditioningManifest(finalized, d1);

    const missing = runFinalizer({ prompt, evidence, bundle: finalBundle, output: path.join(temp, 'missing.json') });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /requires positive-source manifest and bundle/i);

    fs.writeFileSync(sourceBundle, Buffer.concat([sourceBytes, Buffer.from('drift')]));
    const sourceDrift = runFinalizer({ prompt, evidence, bundle: finalBundle, output: path.join(temp, 'source-drift.json'), sourceManifest, sourceBundle });
    assert.notEqual(sourceDrift.status, 0);
    assert.match(sourceDrift.stderr, /positive-source bundle identity/i);

    fs.writeFileSync(sourceBundle, sourceBytes);
    fs.writeFileSync(finalBundle, Buffer.concat([finalBundleBytes, Buffer.from('drift')]));
    const finalDrift = runFinalizer({ prompt, evidence, bundle: finalBundle, output: path.join(temp, 'final-drift.json'), sourceManifest, sourceBundle });
    assert.notEqual(finalDrift.status, 0);
    assert.match(finalDrift.stderr, /final bundle bytes do not match builder evidence identity/i);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

function runFinalizer({ prompt, evidence, bundle, output, sourceManifest = null, sourceBundle = null }) {
  const args = [FINALIZER, '--d1', D1_PATH, '--prompt', prompt, '--evidence', evidence, '--bundle', bundle, '--output', output];
  if (sourceManifest) args.push('--positive-source-manifest', sourceManifest);
  if (sourceBundle) args.push('--positive-source-bundle', sourceBundle);
  return spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
}

function conditioningManifest(d1, candidateId, size, sha256) {
  const identity = conditioningCandidateIdentity(candidateId);
  return {
    schemaVersion: 1,
    stage: 'F5B1_D2_CONDITIONING_RESEARCH',
    status: 'RESEARCH_CANDIDATE',
    productionExecutable: false,
    runtimeAuthorityGranted: false,
    priorRuntimeDependencyAllowed: false,
    sourceTrust: {
      d1ManifestPath: 'src/platform/creative/local-ai/models/kandinsky-2-2-refinement-feasibility.manifest.json',
      d1ModelId: d1.modelId,
      d1Version: d1.version,
      priorRepository: d1.offlinePrior.repository,
      priorRevision: d1.offlinePrior.revision,
      priorSafeWeights: d1.offlinePrior.safeWeights.map(({ path, size, sha256 }) => ({ path, size, sha256 })),
      priorConfigFiles: d1.offlinePrior.requiredConfigIdentity.files.map(({ path, size, sha256 }) => ({ path, size, sha256 })),
    },
    historicalPipeline: {
      diffusersRevision: '746215670a61af1034c470d0b6555be9c60cb7b6',
      pipelineClass: 'KandinskyV22PriorPipeline',
      numImagesPerPrompt: 1,
      numInferenceSteps: 25,
      guidanceScale: 4,
      outputType: 'pt',
    },
    toolchain: toolchain(false),
    determinism: determinism(false),
    conditioning: {
      candidateId,
      conditioningContractSha256: identity.conditioningContractSha256,
      negativeMode: identity.negativeMode,
    },
    bundle: {
      format: 'safetensors', metadataPolicy: 'NONE', tensorOrder: ['image_embeds', 'negative_image_embeds'],
      tensors: { image_embeds: { dtype: 'F32', shape: [1, 2] }, negative_image_embeds: { dtype: 'F32', shape: [1, 2] } },
      size, sha256,
    },
  };
}

function cEvidence(d1, contractSha, sourceManifestBytes, sourceBundleBytes, finalBundleBytes) {
  return {
    schemaVersion: 1, stage: 'F5B1_D2C_CONDITIONING_BUILD', status: 'BUILT_NOT_ADMITTED', candidateId: C_ID,
    conditioningContractSha256: contractSha,
    sourceTrust: {
      d1ModelId: d1.modelId, d1Version: d1.version, priorRepository: d1.offlinePrior.repository,
      priorRevision: d1.offlinePrior.revision, priorPipelineGitBlobSha1: '3b9974a5dd70e8b775caa01efab6b637ff22d9e5',
    },
    toolchain: toolchain(true), determinism: determinism(true),
    bundle: {
      format: 'safetensors', metadataPolicy: 'NONE', tensorOrder: ['image_embeds', 'negative_image_embeds'],
      tensors: { image_embeds: { dtype: 'F32', shape: [1, 2] }, negative_image_embeds: { dtype: 'F32', shape: [1, 2] } },
      size: finalBundleBytes.length, sha256: sha256Bytes(finalBundleBytes),
    },
    composition: {
      policy: 'REUSE_POSITIVE_FROM_ACCEPTED_CANDIDATE',
      positiveSource: {
        candidateId: B_ID,
        conditioningContractSha256: conditioningCandidateIdentity(B_ID).conditioningContractSha256,
        manifestSha256: sha256Bytes(sourceManifestBytes), bundleSize: sourceBundleBytes.length,
        bundleSha256: sha256Bytes(sourceBundleBytes), imageEmbedsSha256: '6'.repeat(64),
      },
      negativeSource: {
        candidateId: C_ID, conditioningContractSha256: contractSha, rawBundleSize: 222,
        rawBundleSha256: '7'.repeat(64), discardedRawImageEmbedsSha256: '8'.repeat(64), negativeImageEmbedsSha256: '9'.repeat(64),
      },
    },
  };
}

function toolchain(withEvidenceStatus) {
  const value = {
    containerImageDigest: `sha256:${'1'.repeat(64)}`, pythonVersion: '3.12.10', diffusersVersion: '0.18.0.dev0',
    torchVersion: '2.0.1', transformersVersion: '4.30.2', numpyVersion: '1.24.4', safetensorsVersion: '0.3.1', platformMachine: 'x86_64',
  };
  return withEvidenceStatus ? { schemaVersion: 1, status: 'TESTED_EXACT', ...value } : value;
}
function determinism(withNetworkPolicy) {
  const value = {
    device: 'cpu', outputDtype: 'float32', torchDeterministicAlgorithms: true,
    numThreads: 1, numInteropThreads: 1, ompNumThreads: 1, mklNumThreads: 1,
    seed: 20260831, generatorPolicy: 'TORCH_CPU_GENERATOR_SINGLE_SEED', latentPolicy: 'NO_EXTERNAL_LATENTS_PIPELINE_RANDN',
  };
  return withNetworkPolicy ? { ...value, networkPolicy: 'CONTAINER_NETWORK_NONE_PLUS_LIBRARY_OFFLINE_GUARD' } : value;
}
