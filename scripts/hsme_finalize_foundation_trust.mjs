import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  hsmeFoundationBenchmarkCampaignV1Digest,
  hsmeFoundationBenchmarkCandidateMayRunV1,
  mayFinalizeHsmeFoundationBenchmarkCampaignV1,
  normalizeHsmeFoundationBenchmarkCampaignV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkCampaignV1.ts';
import {
  hsmeFoundationBenchmarkExecutionProfileDigestV1,
  normalizeHsmeFoundationBenchmarkCandidateTrustV1,
  proveHsmeFoundationBenchmarkCandidateTrustV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkCandidateTrustV1.ts';

const args = Object.fromEntries(process.argv.slice(2).map(value => {
  const [key, ...rest] = value.split('=');
  return [key.replace(/^--/, ''), rest.join('=')];
}));
const rightsPath = args.rights;
const outputDir = args.output;
if (!rightsPath || !outputDir) {
  throw new Error('usage: --rights=<foundation-rights-evidence.json> --output=<dir>');
}

const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const writeJson = async (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
const hashPort = {
  sha256: async bytes => createHash('sha256').update(bytes).digest('hex'),
};

const campaignRaw = await readJson(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json',
);
const profileSet = await readJson(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-execution-profiles.v1.json',
);
const trustTemplate = await readJson(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-candidate-trust.v1.json',
);
const artifactIndex = await readJson(
  'src/platform/creative/local-ai/hsme/hsme-foundation-hub-artifact-evidence-index.v1.json',
);
const rightsEvidence = await readJson(rightsPath);

if (rightsEvidence.schemaVersion !== 'BERS_HSME_FOUNDATION_RIGHTS_EVIDENCE_V1') {
  throw new Error('unexpected rights evidence schema');
}
if (rightsEvidence.fixturePackPinned !== true) {
  throw new Error('fixture pack must be pinned before trust finalization');
}
if (rightsEvidence.candidateOutputsObserved !== false) {
  throw new Error('candidate outputs must remain unobserved during trust finalization');
}
if (rightsEvidence.candidates.length !== 6) {
  throw new Error('rights evidence must contain exactly six candidates');
}

const evidenceById = new Map(rightsEvidence.candidates.map(value => [value.candidateId, value]));
const campaignIds = new Set(campaignRaw.candidates.map(value => value.candidateId));
if (evidenceById.size !== campaignIds.size || [...evidenceById.keys()].some(id => !campaignIds.has(id))) {
  throw new Error('rights evidence roster differs from campaign');
}

for (const entry of profileSet.profiles) {
  const evidence = evidenceById.get(entry.candidateId);
  if (!evidence) throw new Error('missing evidence for profile ' + entry.candidateId);
  entry.executionProfile.artifactManifestDigest = evidence.modelContentSha256;
  if (entry.candidateId === 'sana-sprint-0.6b-split-v1') {
    entry.sourceSpec.sourceEvidence = entry.sourceSpec.sourceEvidence.map(value =>
      value.replace(
        'a7d9fc31dd5c3f5e22dbfd78360777ceed56ae97',
        evidence.artifactManifest.primarySource.immutableRevision,
      )
    );
  }
  entry.executionProfileSha256 = await hsmeFoundationBenchmarkExecutionProfileDigestV1(
    entry.executionProfile,
    hashPort,
  );
}

const profileById = new Map(profileSet.profiles.map(value => [value.candidateId, value]));
for (const candidate of campaignRaw.candidates) {
  const evidence = evidenceById.get(candidate.candidateId);
  const profile = profileById.get(candidate.candidateId);
  if (!evidence || !profile) throw new Error('candidate evidence/profile missing: ' + candidate.candidateId);
  candidate.immutableRevision = evidence.artifactManifest.primarySource.immutableRevision;
  candidate.modelContentSha256 = evidence.modelContentSha256;
  candidate.executionProfileSha256 = profile.executionProfileSha256;
  candidate.rightsState = evidence.rightsReview.commercialUseConclusion === 'COMMERCIAL_ADMISSIBLE_WITH_OBLIGATIONS'
    ? 'REVIEWED_WITH_OBLIGATIONS'
    : evidence.rightsReview.commercialUseConclusion === 'COMMERCIAL_ADMISSIBLE'
      ? 'REVIEWED_COMMERCIAL'
      : (() => { throw new Error('non-admissible rights conclusion for ' + candidate.candidateId); })();
  candidate.rightsEvidenceSha256 = evidence.rightsEvidenceSha256;
}

const campaign = normalizeHsmeFoundationBenchmarkCampaignV1(campaignRaw);
const campaignDigest = await hsmeFoundationBenchmarkCampaignV1Digest(campaign, hashPort);

const trustRaw = {
  ...trustTemplate,
  campaignDigest,
  state: 'PINNED',
  candidates: campaign.candidates.map(candidate => {
    const evidence = evidenceById.get(candidate.candidateId);
    const profile = profileById.get(candidate.candidateId);
    return {
      candidateId: candidate.candidateId,
      artifactManifest: evidence.artifactManifest,
      executionProfile: profile.executionProfile,
      rightsReview: evidence.rightsReview,
    };
  }),
};
const trust = normalizeHsmeFoundationBenchmarkCandidateTrustV1(trustRaw);
const provenTrust = await proveHsmeFoundationBenchmarkCandidateTrustV1(campaign, trust, hashPort);

for (const entry of provenTrust.entries) {
  const candidate = campaign.candidates.find(value => value.candidateId === entry.candidateId);
  if (!candidate) throw new Error('proved trust candidate missing from campaign: ' + entry.candidateId);
  if (entry.modelContentSha256 !== candidate.modelContentSha256) {
    throw new Error('model content digest mismatch: ' + entry.candidateId);
  }
  if (entry.executionProfileSha256 !== candidate.executionProfileSha256) {
    throw new Error('execution profile digest mismatch: ' + entry.candidateId);
  }
  if (entry.rightsEvidenceSha256 !== candidate.rightsEvidenceSha256) {
    throw new Error('rights review digest mismatch: ' + entry.candidateId);
  }
  if (entry.benchmarkRunnable !== true) {
    throw new Error('fully pinned candidate did not become benchmark-runnable: ' + entry.candidateId);
  }
  if (!hsmeFoundationBenchmarkCandidateMayRunV1(campaign, entry.candidateId)) {
    throw new Error('campaign run gate remained closed after all prerequisites: ' + entry.candidateId);
  }
}
if (!mayFinalizeHsmeFoundationBenchmarkCampaignV1(campaign)) {
  throw new Error('campaign cannot finalize after all six trust entries are pinned');
}

const indexById = new Map(artifactIndex.candidates.map(value => [value.candidateId, value]));
for (const evidence of rightsEvidence.candidates) {
  const manifest = evidence.artifactManifest;
  const runtime = manifest.artifacts.filter(value => value.runtimeRequired);
  const replacement = {
    candidateId: evidence.candidateId,
    sourceRoot: manifest.primarySource.sourceRoot,
    immutableRevision: manifest.primarySource.immutableRevision,
    repoFileCount: manifest.artifacts.length,
    runtimeRequiredFileCount: runtime.length,
    lfsSha256VerifiedCount: manifest.artifacts.filter(value =>
      value.identityMethod === 'GIT_LFS_OID_SHA256_VERIFIED'
    ).length,
    gitBlobStreamedSha256Count: manifest.artifacts.filter(value =>
      value.identityMethod === 'STREAMED_LOCAL_SHA256'
    ).length,
    smallGitBytesDownloaded: manifest.artifacts
      .filter(value => value.identityMethod === 'STREAMED_LOCAL_SHA256')
      .reduce((sum, value) => sum + value.bytes, 0),
    modelContentSha256: evidence.modelContentSha256,
  };
  indexById.set(evidence.candidateId, replacement);
}
artifactIndex.candidates = [...indexById.values()].sort((a, b) =>
  a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0
);

const rightsAdmission = {
  schemaVersion: 'BERS_HSME_FOUNDATION_RIGHTS_ADMISSION_V1',
  scope: rightsEvidence.scope,
  reviewPolicySha256: rightsEvidence.reviewPolicySha256,
  rightsSafeRepins: rightsEvidence.rightsSafeRepins,
  candidateOutputsObserved: false,
  candidates: rightsEvidence.candidates.map(value => ({
    candidateId: value.candidateId,
    sourceRoot: value.artifactManifest.primarySource.sourceRoot,
    immutableRevision: value.artifactManifest.primarySource.immutableRevision,
    modelContentSha256: value.modelContentSha256,
    executionProfileSha256: profileById.get(value.candidateId).executionProfileSha256,
    rightsEvidenceSha256: value.rightsEvidenceSha256,
    aggregateLicenseId: value.rightsReview.aggregateLicenseId,
    commercialUseConclusion: value.rightsReview.commercialUseConclusion,
    runtimeArtifactCount: value.runtimeArtifactCount,
  })).sort((a, b) => a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0),
  productionAuthorityGranted: false,
  providerAuthorityGranted: false,
  billingAuthorityGranted: false,
  projectArtifactMutationAllowed: false,
  durableModelFleetPromotionAllowed: false,
  trainingOrDistillationAllowed: false,
};

const summary = {
  schemaVersion: 'BERS_HSME_FOUNDATION_TRUST_FINALIZATION_SUMMARY_V1',
  campaignDigest,
  campaignMayFinalize: true,
  trustState: trust.state,
  candidates: provenTrust.entries,
  sanaRepin: rightsEvidence.rightsSafeRepins.find(value =>
    value.candidateId === 'sana-sprint-0.6b-split-v1'
  ),
  candidateOutputsObserved: false,
  productionAuthorityGranted: false,
  winnerSelectionAllowed: false,
};

await mkdir(outputDir, { recursive: true });
await writeJson(path.join(outputDir, 'hsme-foundation-benchmark-campaign.v1.json'), campaign);
await writeJson(path.join(outputDir, 'hsme-foundation-benchmark-execution-profiles.v1.json'), profileSet);
await writeJson(path.join(outputDir, 'hsme-foundation-benchmark-candidate-trust.v1.json'), trust);
await writeJson(path.join(outputDir, 'hsme-foundation-hub-artifact-evidence-index.v1.json'), artifactIndex);
await writeJson(path.join(outputDir, 'hsme-foundation-rights-admission.v1.json'), rightsAdmission);
await writeJson(path.join(outputDir, 'hsme-foundation-trust-finalization-summary.v1.json'), summary);

console.log(JSON.stringify(summary, null, 2));
