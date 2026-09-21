import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  hsmeFoundationBenchmarkCampaignV1Digest,
  normalizeHsmeFoundationBenchmarkCampaignV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkCampaignV1.ts';
import {
  hsmeFoundationBenchmarkExecutionProfileDigestV1,
  normalizeHsmeFoundationBenchmarkCandidateTrustV1,
  proveHsmeFoundationBenchmarkCandidateTrustV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkCandidateTrustV1.ts';

const OUTPUT_DIR = process.argv[2];
if (!OUTPUT_DIR) throw new Error('usage: node hsme_correct_tiny_sd_quality_profile.mjs <output-dir>');

const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const writeJson = async (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
const hashPort = { sha256: async bytes => createHash('sha256').update(bytes).digest('hex') };

function lexical(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort(lexical).map(key => [key, canonical(value[key])]));
  }
  return value;
}
function domainHash(domain, value) {
  return createHash('sha256').update(domain + '\0' + JSON.stringify(canonical(value))).digest('hex');
}
function without(object, key) {
  return Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));
}
function deepClone(value) { return JSON.parse(JSON.stringify(value)); }

const profilePath = 'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-execution-profiles.v1.json';
const campaignPath = 'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json';
const trustPath = 'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-candidate-trust.v1.json';
const rightsPath = 'src/platform/creative/local-ai/hsme/hsme-foundation-rights-admission.v1.json';
const summaryPath = 'src/platform/creative/local-ai/hsme/hsme-foundation-trust-finalization-summary.v1.json';
const fixturePackPath = 'src/platform/creative/local-ai/hsme/hsme-foundation-fixture-pack-evidence.v1.json';
const correctionPath = 'src/platform/creative/local-ai/hsme/hsme-tiny-sd-quality-profile-correction.v1.json';

const [profilesBefore, campaignBefore, trustBefore, rightsBefore, summaryBefore, fixturePack] = await Promise.all([
  readJson(profilePath), readJson(campaignPath), readJson(trustPath), readJson(rightsPath), readJson(summaryPath), readJson(fixturePackPath),
]);

if (profilesBefore.candidateOutputsObserved !== false || trustBefore.candidateOutputsObserved !== false || rightsBefore.candidateOutputsObserved !== false || fixturePack.candidateOutputsObserved !== false) {
  throw new Error('Tiny-SD profile correction is forbidden after candidate output observation');
}
if (trustBefore.state !== 'PINNED') throw new Error('foundation trust must be PINNED before correction');
if (campaignBefore.status !== 'FIXTURES_PINNED' || campaignBefore.fixturePack.state !== 'PINNED') {
  throw new Error('fixture substrate must remain PINNED');
}

const profiles = deepClone(profilesBefore);
const campaignRaw = deepClone(campaignBefore);
const trustRaw = deepClone(trustBefore);
const rightsAdmission = deepClone(rightsBefore);
const summary = deepClone(summaryBefore);

const tinyBefore = profiles.profiles.find(value => value.candidateId === 'tiny-sd-control-v1');
if (!tinyBefore) throw new Error('Tiny-SD profile missing');
if (profiles.runtimeLocks['tiny-sd-historical-v1']?.packages?.torch !== '2.0.1+cpu') throw new Error('historical CPU evidence lock drift');

let committedCorrection = null;
try {
  committedCorrection = await readJson(correctionPath);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
const alreadyCorrected =
  tinyBefore.runtimeLockId === 'tiny-sd-quality-gpu-v1'
  && tinyBefore.sourceSpec.stepCount === 50
  && tinyBefore.executionProfile.stepCount === 50;

if (!alreadyCorrected) {
  if (tinyBefore.runtimeLockId !== 'tiny-sd-historical-v1') throw new Error('unexpected Tiny-SD runtime lock before correction');
  if (tinyBefore.sourceSpec.stepCount !== 12 || tinyBefore.executionProfile.stepCount !== 12) throw new Error('expected accelerated 12-step profile before correction');
  if (committedCorrection !== null) throw new Error('correction evidence exists before substrate correction');
} else {
  if (!committedCorrection || committedCorrection.schemaVersion !== 'BERS_HSME_TINY_SD_QUALITY_PROFILE_CORRECTION_V1') {
    throw new Error('corrected substrate requires committed correction evidence');
  }
}
const oldRuntimeLockId = alreadyCorrected ? committedCorrection.oldRuntimeLockId : tinyBefore.runtimeLockId;
const oldStepCount = alreadyCorrected ? committedCorrection.oldStepCount : tinyBefore.executionProfile.stepCount;
const oldExecutionProfileSha256 = alreadyCorrected ? committedCorrection.oldExecutionProfileSha256 : tinyBefore.executionProfileSha256;

const newLock = {
  python: '3.11',
  platform: 'LINUX_X86_64_CUDA_11_8',
  packages: {
    torch: '2.0.1+cu118',
    diffusers: '0.19.0',
    transformers: '4.30.2',
    'huggingface-hub': '0.16.4',
    numpy: '1.24.4',
    safetensors: '0.3.1',
  },
  packageIndexes: {
    torch: 'https://download.pytorch.org/whl/cu118',
    default: 'https://pypi.org/simple',
  },
  sourceEvidence: [
    'https://huggingface.co/segmind/tiny-sd/blob/cad0bd7495fa6c4bcca01b19a723dc91627fe84f/README.md',
    'scripts/probe-tiny-sd-d5-control.py',
    'https://huggingface.co/docs/diffusers/v0.19.0/api/pipelines/stable_diffusion/text2img',
    'https://docs.pytorch.org/get-started/previous-versions/#v201',
    'https://download.pytorch.org/whl/cu118/torch/',
  ],
};
newLock.lockSha256 = domainHash('bers:hsme:foundation-runtime-lock:v1', newLock);
if (alreadyCorrected) {
  const existing = profiles.runtimeLocks['tiny-sd-quality-gpu-v1'];
  if (!existing || JSON.stringify(existing) !== JSON.stringify(newLock)) {
    throw new Error('committed Tiny-SD quality GPU runtime lock drift');
  }
} else {
  profiles.runtimeLocks['tiny-sd-quality-gpu-v1'] = newLock;
}

const tiny = profiles.profiles.find(value => value.candidateId === 'tiny-sd-control-v1');
tiny.runtimeLockId = 'tiny-sd-quality-gpu-v1';
tiny.sourceSpec.stepCount = 50;
tiny.sourceSpec.sourceEvidence = [
  'segmind/tiny-sd@cad0bd7495fa6c4bcca01b19a723dc91627fe84f/README.md',
  'scripts/probe-tiny-sd-d5-control.py',
  'diffusers==0.19.0 StableDiffusionPipeline reference defaults',
  'pytorch==2.0.1 CUDA 11.8 official wheel index',
];
tiny.executionProfile.toolchainLockSha256 = newLock.lockSha256;
tiny.executionProfile.stepCount = 50;

if (tiny.executionProfile.precisionPolicy !== 'FP16_MODEL_WEIGHTS_FP32_SCHEDULER_CONTROL') throw new Error('Tiny-SD FP16 quality precision drift');
if (tiny.executionProfile.hardwareBackendClass !== 'CUDA_FP16_REFERENCE_GPU') throw new Error('Tiny-SD CUDA quality backend drift');
if (tiny.executionProfile.schedulerSampler !== 'DPMSolverMultistepScheduler:dpmsolver++:order2:midpoint') throw new Error('Tiny-SD pinned scheduler drift');
if (tiny.sourceSpec.guidance.guidanceScale !== 7.5 || tiny.sourceSpec.resolutionAspect.textToImage.width !== 512 || tiny.sourceSpec.resolutionAspect.textToImage.height !== 512) {
  throw new Error('Tiny-SD reference guidance/resolution drift');
}

tiny.executionProfileSha256 = await hsmeFoundationBenchmarkExecutionProfileDigestV1(tiny.executionProfile, hashPort);

const campaignTiny = campaignRaw.candidates.find(value => value.candidateId === tiny.candidateId);
campaignTiny.executionProfileSha256 = tiny.executionProfileSha256;
const campaign = normalizeHsmeFoundationBenchmarkCampaignV1(campaignRaw);
const campaignDigest = await hsmeFoundationBenchmarkCampaignV1Digest(campaign, hashPort);

trustRaw.campaignDigest = campaignDigest;
const trustTiny = trustRaw.candidates.find(value => value.candidateId === tiny.candidateId);
trustTiny.executionProfile = deepClone(tiny.executionProfile);
const trust = normalizeHsmeFoundationBenchmarkCandidateTrustV1(trustRaw);
const proof = await proveHsmeFoundationBenchmarkCandidateTrustV1(campaign, trust, hashPort);
const tinyProof = proof.entries.find(value => value.candidateId === tiny.candidateId);
if (!tinyProof || !tinyProof.benchmarkRunnable || tinyProof.executionProfileSha256 !== tiny.executionProfileSha256) {
  throw new Error('corrected Tiny-SD profile did not prove through PINNED trust');
}

const rightsTiny = rightsAdmission.candidates.find(value => value.candidateId === tiny.candidateId);
rightsTiny.executionProfileSha256 = tiny.executionProfileSha256;
summary.campaignDigest = campaignDigest;
summary.candidates = proof.entries;

const beforeTinyCampaign = campaignBefore.candidates.find(value => value.candidateId === tiny.candidateId);
const beforeTinyTrust = trustBefore.candidates.find(value => value.candidateId === tiny.candidateId);
const unchangedCandidates = campaign.candidates
  .filter(value => value.candidateId !== tiny.candidateId)
  .map(value => value.candidateId);
for (const id of unchangedCandidates) {
  const before = campaignBefore.candidates.find(value => value.candidateId === id);
  const after = campaign.candidates.find(value => value.candidateId === id);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('non-Tiny candidate changed: ' + id);
}
if (JSON.stringify(campaign.fixturePack) !== JSON.stringify(campaignBefore.fixturePack)) throw new Error('fixture pack changed');
if (JSON.stringify(campaign.slices) !== JSON.stringify(campaignBefore.slices)) throw new Error('quality slices/thresholds changed');
if (campaignTiny.modelContentSha256 !== beforeTinyCampaign.modelContentSha256 || campaignTiny.rightsEvidenceSha256 !== beforeTinyCampaign.rightsEvidenceSha256 || campaignTiny.immutableRevision !== beforeTinyCampaign.immutableRevision) {
  throw new Error('Tiny-SD model/right identity changed');
}
if (JSON.stringify(trustTiny.artifactManifest) !== JSON.stringify(beforeTinyTrust.artifactManifest) || JSON.stringify(trustTiny.rightsReview) !== JSON.stringify(beforeTinyTrust.rightsReview)) {
  throw new Error('Tiny-SD artifact/rights evidence changed');
}

const correction = {
  schemaVersion: 'BERS_HSME_TINY_SD_QUALITY_PROFILE_CORRECTION_V1',
  reason: 'PRE_OUTPUT_QUALITY_PROFILE_RUNTIME_CONSISTENCY',
  candidateId: tiny.candidateId,
  candidateOutputsObservedBefore: false,
  candidateOutputsObservedAfter: false,
  modelContentSha256: campaignTiny.modelContentSha256,
  rightsEvidenceSha256: campaignTiny.rightsEvidenceSha256,
  oldExecutionProfileSha256,
  newExecutionProfileSha256: tiny.executionProfileSha256,
  oldRuntimeLockId,
  newRuntimeLockId: tiny.runtimeLockId,
  oldTorchVersion: profilesBefore.runtimeLocks['tiny-sd-historical-v1'].packages.torch,
  newTorchVersion: newLock.packages.torch,
  oldStepCount,
  newStepCount: tiny.executionProfile.stepCount,
  guidanceScale: tiny.sourceSpec.guidance.guidanceScale,
  width: tiny.sourceSpec.resolutionAspect.textToImage.width,
  height: tiny.sourceSpec.resolutionAspect.textToImage.height,
  schedulerSampler: tiny.executionProfile.schedulerSampler,
  precisionPolicy: tiny.executionProfile.precisionPolicy,
  hardwareBackendClass: tiny.executionProfile.hardwareBackendClass,
  runtimeLockSha256: newLock.lockSha256,
  oldCampaignDigest: alreadyCorrected ? committedCorrection.oldCampaignDigest : trustBefore.campaignDigest,
  newCampaignDigest: campaignDigest,
  fixturePackChanged: false,
  thresholdsChanged: false,
  modelBytesChanged: false,
  rightsChanged: false,
  efficiencyUsedInQualitySelection: false,
  productionAuthorityGranted: false,
  providerAuthorityGranted: false,
  billingAuthorityGranted: false,
  projectArtifactMutationAllowed: false,
  aeeExecutionAuthorityGranted: false,
  durableModelFleetPromotionAllowed: false,
  trainingOrDistillationAllowed: false,
  winnerSelectionAllowed: false,
};

if (alreadyCorrected && JSON.stringify(correction) !== JSON.stringify(committedCorrection)) {
  throw new Error('committed Tiny-SD correction evidence is not reproducible');
}

await mkdir(OUTPUT_DIR, { recursive: true });
await writeJson(path.join(OUTPUT_DIR, 'hsme-foundation-benchmark-execution-profiles.v1.json'), profiles);
await writeJson(path.join(OUTPUT_DIR, 'hsme-foundation-benchmark-campaign.v1.json'), campaign);
await writeJson(path.join(OUTPUT_DIR, 'hsme-foundation-benchmark-candidate-trust.v1.json'), trust);
await writeJson(path.join(OUTPUT_DIR, 'hsme-foundation-rights-admission.v1.json'), rightsAdmission);
await writeJson(path.join(OUTPUT_DIR, 'hsme-foundation-trust-finalization-summary.v1.json'), summary);
await writeJson(path.join(OUTPUT_DIR, 'hsme-tiny-sd-quality-profile-correction.v1.json'), correction);
console.log(JSON.stringify(correction, null, 2));
