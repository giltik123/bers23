import {
  normalizeHsmeFoundationBenchmarkCampaignV1,
} from './HsmeFoundationBenchmarkCampaignV1';
import {
  normalizeHsmeFoundationBenchmarkCandidateTrustV1,
} from './HsmeFoundationBenchmarkCandidateTrustV1';
import {
  normalizeHsmeFoundationFixturePlanV1,
} from './HsmeFoundationBenchmarkFixturePlanV1';

export const HSME_FOUNDATION_BENCHMARK_RUN_EVIDENCE_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_BENCHMARK_RUN_EVIDENCE_V1' as const;
export const HSME_FOUNDATION_BENCHMARK_OUTPUT_SET_DIGEST_DOMAIN =
  'bers:hsme:foundation-benchmark-output-set:v1\0' as const;
export const HSME_FOUNDATION_BENCHMARK_RUN_EVIDENCE_DIGEST_DOMAIN =
  'bers:hsme:foundation-benchmark-run-evidence:v1\0' as const;

const CAPABILITIES = Object.freeze([
  'TEXT_TO_IMAGE',
  'IMAGE_EDITING',
] as const);

const RUN_STATUSES = Object.freeze([
  'COMPLETE',
  'BLOCKED_PARITY_PENDING',
  'NOT_APPLICABLE',
  'FAILED',
] as const);

const HEX64 = /^[0-9a-f]{64}$/;
const BLIND_ID = /^blind_[0-9a-f]{24}$/;

type Capability = typeof CAPABILITIES[number];
type RunStatus = typeof RUN_STATUSES[number];

export type HsmeFoundationBenchmarkOutputRecordV1 = Readonly<{
  fixtureId: string;
  seed: number;
  blindId: string;
  imageSha256: string;
}>;

export type HsmeFoundationBenchmarkCandidateRunV1 = Readonly<{
  candidateId: string;
  capability: Capability;
  status: RunStatus;
  immutableRevision: string;
  modelContentSha256: string;
  executionProfileSha256: string;
  rightsEvidenceSha256: string;
  runtimeInventorySha256: string | 'UNKNOWN';
  outputSetSha256: string | 'UNKNOWN';
  reviewPackageSha256: string | 'UNKNOWN';
  failureEvidenceSha256: string | 'UNKNOWN';
  outputs: readonly HsmeFoundationBenchmarkOutputRecordV1[];
}>;

export type HsmeFoundationBenchmarkRunEvidenceV1 = Readonly<{
  schemaVersion: typeof HSME_FOUNDATION_BENCHMARK_RUN_EVIDENCE_V1_SCHEMA;
  campaignId: string;
  campaignDigest: string;
  fixtureSetSha256: string;
  outputSetContractSha256: string;
  requiredSeeds: readonly number[];
  candidateOutputsObserved: boolean;
  runs: readonly HsmeFoundationBenchmarkCandidateRunV1[];
  productionAuthorityGranted: false;
  providerAuthorityGranted: false;
  billingAuthorityGranted: false;
  projectArtifactMutationAllowed: false;
  aeeExecutionAuthorityGranted: false;
  durableModelFleetPromotionAllowed: false;
  trainingOrDistillationAllowed: false;
  winnerSelectionAllowed: false;
}>;

export type HsmeFoundationBenchmarkRunProofV1 = Readonly<{
  schemaVersion: typeof HSME_FOUNDATION_BENCHMARK_RUN_EVIDENCE_V1_SCHEMA;
  campaignId: string;
  state: 'FULL_COMPLETE' | 'PARTIAL_BLOCKED' | 'FAILED';
  completeRunCount: number;
  blockedRunCount: number;
  notApplicableRunCount: number;
  failedRunCount: number;
  observedOutputCount: number;
  candidateOutputsObserved: boolean;
  productionAuthorityGranted: false;
  winnerSelectionAllowed: false;
}>;

export interface HsmeFoundationBenchmarkRunHashPortV1 {
  sha256(bytes: Uint8Array): Promise<string>;
}

export class HsmeFoundationBenchmarkRunEvidenceV1Error extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'HsmeFoundationBenchmarkRunEvidenceV1Error';
    this.code = code;
  }
}

export function normalizeHsmeFoundationBenchmarkRunEvidenceV1(
  raw: unknown,
): HsmeFoundationBenchmarkRunEvidenceV1 {
  const record = exactRecord(raw, [
    'schemaVersion',
    'campaignId',
    'campaignDigest',
    'fixtureSetSha256',
    'outputSetContractSha256',
    'requiredSeeds',
    'candidateOutputsObserved',
    'runs',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'durableModelFleetPromotionAllowed',
    'trainingOrDistillationAllowed',
    'winnerSelectionAllowed',
  ], 'runEvidence');

  if (record.schemaVersion !== HSME_FOUNDATION_BENCHMARK_RUN_EVIDENCE_V1_SCHEMA) {
    fail('hsme_foundation_run_schema_unsupported', 'unsupported run-evidence schema');
  }

  const requiredSeeds = integerSet(record.requiredSeeds, 'requiredSeeds', 1, 16);
  const runsRaw = record.runs;
  if (!Array.isArray(runsRaw) || runsRaw.length !== 12) {
    fail('hsme_foundation_run_count_invalid', 'runs must contain exactly 12 candidate/capability rows');
  }
  const runs = runsRaw.map((value, index) => normalizeRun(value, `runs[${index}]`));
  const runKeys = runs.map(value => `${value.candidateId}\0${value.capability}`);
  if (new Set(runKeys).size !== runKeys.length) {
    fail('hsme_foundation_run_duplicate', 'candidate/capability run rows must be unique');
  }

  const authorityFields = [
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'durableModelFleetPromotionAllowed',
    'trainingOrDistillationAllowed',
    'winnerSelectionAllowed',
  ] as const;
  for (const field of authorityFields) {
    if (record[field] !== false) {
      fail('hsme_foundation_run_authority_forbidden', `${field} must be false`);
    }
  }

  return deepFreeze({
    schemaVersion: HSME_FOUNDATION_BENCHMARK_RUN_EVIDENCE_V1_SCHEMA,
    campaignId: identifier(record.campaignId, 'campaignId', 160),
    campaignDigest: sha256(record.campaignDigest, 'campaignDigest'),
    fixtureSetSha256: sha256(record.fixtureSetSha256, 'fixtureSetSha256'),
    outputSetContractSha256: sha256(record.outputSetContractSha256, 'outputSetContractSha256'),
    requiredSeeds,
    candidateOutputsObserved: booleanValue(record.candidateOutputsObserved, 'candidateOutputsObserved'),
    runs: Object.freeze([...runs].sort(compareRuns)),
    productionAuthorityGranted: false,
    providerAuthorityGranted: false,
    billingAuthorityGranted: false,
    projectArtifactMutationAllowed: false,
    aeeExecutionAuthorityGranted: false,
    durableModelFleetPromotionAllowed: false,
    trainingOrDistillationAllowed: false,
    winnerSelectionAllowed: false,
  });
}

export function normalizeHsmeFoundationBenchmarkCandidateRunV1(
  raw: unknown,
): HsmeFoundationBenchmarkCandidateRunV1 {
  return normalizeRun(raw, 'candidateRun');
}

export async function proveHsmeFoundationBenchmarkRunEvidenceV1(
  rawCampaign: unknown,
  rawTrust: unknown,
  rawFixturePlan: unknown,
  rawFixturePackEvidence: unknown,
  rawRunEvidence: unknown,
  hash: HsmeFoundationBenchmarkRunHashPortV1,
): Promise<HsmeFoundationBenchmarkRunProofV1> {
  const campaign = normalizeHsmeFoundationBenchmarkCampaignV1(rawCampaign);
  const trust = normalizeHsmeFoundationBenchmarkCandidateTrustV1(rawTrust);
  const fixturePlan = normalizeHsmeFoundationFixturePlanV1(rawFixturePlan);
  const evidence = normalizeHsmeFoundationBenchmarkRunEvidenceV1(rawRunEvidence);

  if (trust.state !== 'PINNED') {
    fail('hsme_foundation_run_trust_not_pinned', 'candidate trust must be PINNED before execution evidence');
  }
  if (trust.campaignId !== campaign.campaignId) {
    fail('hsme_foundation_run_trust_campaign_mismatch', 'trust campaign id differs from campaign');
  }
  if (evidence.campaignId !== campaign.campaignId) {
    fail('hsme_foundation_run_campaign_mismatch', 'run evidence campaign id differs from campaign');
  }
  if (evidence.campaignDigest !== trust.campaignDigest) {
    fail('hsme_foundation_run_campaign_digest_mismatch', 'run evidence campaign digest differs from PINNED trust');
  }
  if (campaign.fixturePack.state !== 'PINNED' || fixturePlan.state !== 'PINNED') {
    fail('hsme_foundation_run_fixture_not_pinned', 'fixture campaign/plan must be PINNED');
  }
  if (evidence.fixtureSetSha256 !== campaign.fixturePack.fixtureSetSha256) {
    fail('hsme_foundation_run_fixture_set_mismatch', 'run evidence fixture set differs from campaign');
  }
  if (evidence.outputSetContractSha256 !== campaign.fixturePack.outputSetContractSha256) {
    fail('hsme_foundation_run_output_contract_mismatch', 'run evidence output contract differs from campaign');
  }

  const pack = fixturePack(rawFixturePackEvidence);
  if (pack.digests.fixtureSetSha256 !== evidence.fixtureSetSha256) {
    fail('hsme_foundation_run_pack_fixture_set_mismatch', 'fixture pack evidence differs from run evidence');
  }
  if (pack.digests.outputSetContractSha256 !== evidence.outputSetContractSha256) {
    fail('hsme_foundation_run_pack_output_contract_mismatch', 'output contract evidence differs from run evidence');
  }
  const outputContract = exactRecord(pack.sources.outputSetContract, [
    'schemaVersion',
    'outputsPerTextPrompt',
    'outputsPerEditCase',
    'seedSource',
    'requiredSeeds',
    'naming',
    'postGenerationSelectionAllowed',
    'missingOutputDisposition',
    'binaryOutputsPublishableFromOrdinaryCI',
    'candidateOutputsObservedAtFreeze',
  ], 'fixturePack.sources.outputSetContract');
  const frozenSeeds = integerSet(outputContract.requiredSeeds, 'fixturePack.sources.outputSetContract.requiredSeeds', 1, 16);
  if (!sameNumbers(frozenSeeds, evidence.requiredSeeds)) {
    fail('hsme_foundation_run_seed_set_mismatch', 'run evidence seed set differs from frozen output contract');
  }
  if (
    outputContract.postGenerationSelectionAllowed !== false
    || outputContract.missingOutputDisposition !== 'FAIL_CLOSED'
    || outputContract.candidateOutputsObservedAtFreeze !== false
  ) {
    fail('hsme_foundation_run_output_contract_not_fail_closed', 'frozen output contract is not fail closed');
  }

  const candidateById = new Map(campaign.candidates.map(value => [value.candidateId, value]));
  const trustById = new Map(trust.candidates.map(value => [value.candidateId, value]));
  const expectedRunKeys = new Set<string>();
  for (const candidate of campaign.candidates) {
    for (const capability of CAPABILITIES) {
      expectedRunKeys.add(`${candidate.candidateId}\0${capability}`);
    }
  }
  const actualRunKeys = new Set(evidence.runs.map(value => `${value.candidateId}\0${value.capability}`));
  if (!sameStrings([...expectedRunKeys].sort(lexical), [...actualRunKeys].sort(lexical))) {
    fail('hsme_foundation_run_roster_mismatch', 'run evidence must cover every campaign candidate/capability pair exactly once');
  }

  const blindIds = new Set<string>();
  let observedOutputCount = 0;
  let completeRunCount = 0;
  let blockedRunCount = 0;
  let notApplicableRunCount = 0;
  let failedRunCount = 0;

  for (const run of evidence.runs) {
    const candidate = candidateById.get(run.candidateId);
    const trustCandidate = trustById.get(run.candidateId);
    if (!candidate || !trustCandidate) {
      fail('hsme_foundation_run_candidate_missing', `candidate missing from frozen campaign/trust: ${run.candidateId}`);
    }
    if (
      run.immutableRevision !== candidate.immutableRevision
      || run.modelContentSha256 !== candidate.modelContentSha256
      || run.executionProfileSha256 !== candidate.executionProfileSha256
      || run.rightsEvidenceSha256 !== candidate.rightsEvidenceSha256
    ) {
      fail('hsme_foundation_run_candidate_identity_mismatch', `candidate identity drift: ${run.candidateId}`);
    }
    if (trustCandidate.executionProfile.artifactManifestDigest !== run.modelContentSha256) {
      fail('hsme_foundation_run_trust_binding_mismatch', `trust/profile content drift: ${run.candidateId}`);
    }

    const supported = candidate.capabilities.includes(run.capability);
    const expectedFixtures = fixturePlan.assets
      .filter(value => value.capability === run.capability)
      .map(value => value.fixtureId)
      .sort(lexical);
    const expectedOutputKeys = new Set(
      expectedFixtures.flatMap(fixtureId =>
        evidence.requiredSeeds.map(seed => `${fixtureId}\0${seed}`)
      ),
    );

    if (!supported) {
      if (run.status !== 'NOT_APPLICABLE') {
        fail('hsme_foundation_run_unsupported_status_invalid', `${run.candidateId}/${run.capability} must be NOT_APPLICABLE`);
      }
      assertNoRunPayload(run, 'NOT_APPLICABLE');
      notApplicableRunCount += 1;
      continue;
    }

    if (run.status === 'NOT_APPLICABLE') {
      fail('hsme_foundation_run_supported_marked_not_applicable', `${run.candidateId}/${run.capability} is supported by campaign`);
    }
    if (run.status === 'BLOCKED_PARITY_PENDING') {
      if (run.candidateId !== 'sana-sprint-0.6b-split-v1' || run.capability !== 'TEXT_TO_IMAGE') {
        fail('hsme_foundation_run_parity_block_scope_invalid', 'BLOCKED_PARITY_PENDING is reserved for SANA T2I');
      }
      assertNoRunPayload(run, 'BLOCKED_PARITY_PENDING');
      blockedRunCount += 1;
      continue;
    }

    if (run.status === 'COMPLETE') {
      if (!HEX64.test(run.runtimeInventorySha256) || !HEX64.test(run.reviewPackageSha256)) {
        fail('hsme_foundation_run_complete_evidence_missing', `COMPLETE run evidence missing digests: ${run.candidateId}/${run.capability}`);
      }
      if (run.failureEvidenceSha256 !== 'UNKNOWN') {
        fail('hsme_foundation_run_complete_failure_evidence_forbidden', 'COMPLETE run cannot carry failure evidence');
      }
      const actualOutputKeys = run.outputs.map(value => `${value.fixtureId}\0${value.seed}`);
      if (new Set(actualOutputKeys).size !== actualOutputKeys.length) {
        fail('hsme_foundation_run_output_duplicate', `duplicate fixture/seed output: ${run.candidateId}/${run.capability}`);
      }
      if (!sameStrings([...expectedOutputKeys].sort(lexical), [...actualOutputKeys].sort(lexical))) {
        fail('hsme_foundation_run_output_set_incomplete', `COMPLETE output set differs from frozen contract: ${run.candidateId}/${run.capability}`);
      }
      const digest = await outputSetDigest(run.outputs, hash);
      if (run.outputSetSha256 !== digest) {
        fail('hsme_foundation_run_output_digest_mismatch', `output set digest mismatch: ${run.candidateId}/${run.capability}`);
      }
      completeRunCount += 1;
    } else if (run.status === 'FAILED') {
      if (!HEX64.test(run.failureEvidenceSha256)) {
        fail('hsme_foundation_run_failure_evidence_missing', 'FAILED run requires failureEvidenceSha256');
      }
      if (!HEX64.test(run.runtimeInventorySha256)) {
        fail('hsme_foundation_run_failed_runtime_evidence_missing', 'FAILED run requires runtimeInventorySha256');
      }
      if (run.reviewPackageSha256 !== 'UNKNOWN') {
        fail('hsme_foundation_run_failed_review_package_forbidden', 'FAILED run cannot carry a review package');
      }
      if (run.outputSetSha256 !== 'UNKNOWN') {
        const digest = await outputSetDigest(run.outputs, hash);
        if (run.outputSetSha256 !== digest) {
          fail('hsme_foundation_run_partial_output_digest_mismatch', 'FAILED partial output digest mismatch');
        }
      }
      for (const output of run.outputs) {
        if (!expectedOutputKeys.has(`${output.fixtureId}\0${output.seed}`)) {
          fail('hsme_foundation_run_failed_output_unplanned', 'FAILED run contains unplanned output');
        }
      }
      failedRunCount += 1;
    }

    for (const output of run.outputs) {
      if (output.blindId.includes(run.candidateId) || output.blindId.includes(run.capability.toLowerCase())) {
        fail('hsme_foundation_run_blind_id_leaks_candidate', 'blind id leaks candidate/capability identity');
      }
      if (blindIds.has(output.blindId)) {
        fail('hsme_foundation_run_blind_id_duplicate', 'blind ids must be globally unique');
      }
      blindIds.add(output.blindId);
      observedOutputCount += 1;
    }
  }

  if (evidence.candidateOutputsObserved !== (observedOutputCount > 0)) {
    fail('hsme_foundation_run_observation_flag_mismatch', 'candidateOutputsObserved must exactly reflect output presence');
  }

  const state: HsmeFoundationBenchmarkRunProofV1['state'] =
    failedRunCount > 0
      ? 'FAILED'
      : blockedRunCount > 0
        ? 'PARTIAL_BLOCKED'
        : 'FULL_COMPLETE';

  return deepFreeze({
    schemaVersion: HSME_FOUNDATION_BENCHMARK_RUN_EVIDENCE_V1_SCHEMA,
    campaignId: campaign.campaignId,
    state,
    completeRunCount,
    blockedRunCount,
    notApplicableRunCount,
    failedRunCount,
    observedOutputCount,
    candidateOutputsObserved: evidence.candidateOutputsObserved,
    productionAuthorityGranted: false,
    winnerSelectionAllowed: false,
  });
}

export async function hsmeFoundationBenchmarkRunEvidenceV1Digest(
  raw: unknown,
  hash: HsmeFoundationBenchmarkRunHashPortV1,
): Promise<string> {
  const normalized = normalizeHsmeFoundationBenchmarkRunEvidenceV1(raw);
  const bytes = new TextEncoder().encode(
    HSME_FOUNDATION_BENCHMARK_RUN_EVIDENCE_DIGEST_DOMAIN + JSON.stringify(normalized),
  );
  const digest = await hash.sha256(bytes);
  if (!HEX64.test(digest)) {
    fail('hsme_foundation_run_hash_port_invalid', 'hash port must return lowercase SHA-256 hex');
  }
  return digest;
}

async function outputSetDigest(
  outputs: readonly HsmeFoundationBenchmarkOutputRecordV1[],
  hash: HsmeFoundationBenchmarkRunHashPortV1,
): Promise<string> {
  const normalized = [...outputs].sort(compareOutputs);
  const bytes = new TextEncoder().encode(
    HSME_FOUNDATION_BENCHMARK_OUTPUT_SET_DIGEST_DOMAIN + JSON.stringify(normalized),
  );
  const digest = await hash.sha256(bytes);
  if (!HEX64.test(digest)) {
    fail('hsme_foundation_run_hash_port_invalid', 'hash port must return lowercase SHA-256 hex');
  }
  return digest;
}

function normalizeRun(raw: unknown, path: string): HsmeFoundationBenchmarkCandidateRunV1 {
  const record = exactRecord(raw, [
    'candidateId',
    'capability',
    'status',
    'immutableRevision',
    'modelContentSha256',
    'executionProfileSha256',
    'rightsEvidenceSha256',
    'runtimeInventorySha256',
    'outputSetSha256',
    'reviewPackageSha256',
    'failureEvidenceSha256',
    'outputs',
  ], path);
  const outputsRaw = record.outputs;
  if (!Array.isArray(outputsRaw) || outputsRaw.length > 64) {
    fail('hsme_foundation_run_outputs_invalid', `${path}.outputs must contain 0..64 entries`);
  }
  return Object.freeze({
    candidateId: identifier(record.candidateId, `${path}.candidateId`, 120),
    capability: enumValue(record.capability, CAPABILITIES, `${path}.capability`),
    status: enumValue(record.status, RUN_STATUSES, `${path}.status`),
    immutableRevision: revision(record.immutableRevision, `${path}.immutableRevision`),
    modelContentSha256: sha256(record.modelContentSha256, `${path}.modelContentSha256`),
    executionProfileSha256: sha256(record.executionProfileSha256, `${path}.executionProfileSha256`),
    rightsEvidenceSha256: sha256(record.rightsEvidenceSha256, `${path}.rightsEvidenceSha256`),
    runtimeInventorySha256: shaOrUnknown(record.runtimeInventorySha256, `${path}.runtimeInventorySha256`),
    outputSetSha256: shaOrUnknown(record.outputSetSha256, `${path}.outputSetSha256`),
    reviewPackageSha256: shaOrUnknown(record.reviewPackageSha256, `${path}.reviewPackageSha256`),
    failureEvidenceSha256: shaOrUnknown(record.failureEvidenceSha256, `${path}.failureEvidenceSha256`),
    outputs: Object.freeze(outputsRaw.map((value, index) => normalizeOutput(value, `${path}.outputs[${index}]`)).sort(compareOutputs)),
  });
}

function normalizeOutput(raw: unknown, path: string): HsmeFoundationBenchmarkOutputRecordV1 {
  const record = exactRecord(raw, ['fixtureId', 'seed', 'blindId', 'imageSha256'], path);
  const blindId = text(record.blindId, `${path}.blindId`, 30);
  if (!BLIND_ID.test(blindId)) {
    fail('hsme_foundation_run_blind_id_invalid', `${path}.blindId must be opaque blind_<24hex>`);
  }
  return Object.freeze({
    fixtureId: identifier(record.fixtureId, `${path}.fixtureId`, 160),
    seed: safeInteger(record.seed, `${path}.seed`, 0, 0xFFFFFFFF),
    blindId,
    imageSha256: sha256(record.imageSha256, `${path}.imageSha256`),
  });
}

function assertNoRunPayload(run: HsmeFoundationBenchmarkCandidateRunV1, status: string): void {
  if (run.outputs.length !== 0) {
    fail('hsme_foundation_run_blocked_outputs_forbidden', `${status} run cannot contain outputs`);
  }
  for (const field of ['runtimeInventorySha256', 'outputSetSha256', 'reviewPackageSha256', 'failureEvidenceSha256'] as const) {
    if (run[field] !== 'UNKNOWN') {
      fail('hsme_foundation_run_blocked_evidence_forbidden', `${status} run ${field} must be UNKNOWN`);
    }
  }
}

function fixturePack(raw: unknown): {
  digests: Record<string, string>;
  sources: Record<string, unknown>;
} {
  const record = exactRecord(raw, [
    'schemaVersion',
    'fixturePlanSha256',
    'sources',
    'digests',
    'candidateOutputsObserved',
    'privateUserDataAllowed',
    'productionAuthorityGranted',
    'winnerSelectionAllowed',
  ], 'fixturePack');
  if (record.schemaVersion !== 'BERS_HSME_FOUNDATION_FIXTURE_PACK_EVIDENCE_V1') {
    fail('hsme_foundation_run_fixture_pack_schema_invalid', 'fixture pack schema mismatch');
  }
  if (
    record.candidateOutputsObserved !== false
    || record.privateUserDataAllowed !== false
    || record.productionAuthorityGranted !== false
    || record.winnerSelectionAllowed !== false
  ) {
    fail('hsme_foundation_run_fixture_pack_authority_invalid', 'fixture pack freeze boundary widened');
  }
  const digests = exactRecord(record.digests, [
    'fixtureSetSha256',
    'fixturePolicySha256',
    'promptInputSetSha256',
    'blindedReviewRubricSha256',
    'deterministicInputPolicySha256',
    'outputSetContractSha256',
    'licenseEvidenceSha256',
  ], 'fixturePack.digests');
  const normalizedDigests: Record<string, string> = {};
  for (const [key, value] of Object.entries(digests)) normalizedDigests[key] = sha256(value, `fixturePack.digests.${key}`);
  const sources = record.sources;
  if (!sources || typeof sources !== 'object' || Array.isArray(sources)) {
    fail('hsme_foundation_run_fixture_pack_sources_invalid', 'fixture pack sources must be an object');
  }
  return { digests: normalizedDigests, sources: sources as Record<string, unknown> };
}

function exactRecord(raw: unknown, allowed: readonly string[], path: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('hsme_foundation_run_record_invalid', `${path} must be an object`);
  }
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      fail('hsme_foundation_run_field_unknown', `${path}.${key} is not allowed`);
    }
  }
  for (const key of allowed) {
    if (!Object.hasOwn(record, key)) {
      fail('hsme_foundation_run_field_missing', `${path}.${key} is required`);
    }
  }
  return record;
}

function enumValue<T extends readonly string[]>(value: unknown, values: T, path: string): T[number] {
  if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) {
    fail('hsme_foundation_run_enum_invalid', `${path} is invalid`);
  }
  return value as T[number];
}

function sha256(value: unknown, path: string): string {
  const result = text(value, path, 64);
  if (!HEX64.test(result)) fail('hsme_foundation_run_hash_invalid', `${path} must be lowercase SHA-256`);
  return result;
}

function shaOrUnknown(value: unknown, path: string): string | 'UNKNOWN' {
  if (value === 'UNKNOWN') return 'UNKNOWN';
  return sha256(value, path);
}

function revision(value: unknown, path: string): string {
  const result = text(value, path, 64);
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(result)) {
    fail('hsme_foundation_run_revision_invalid', `${path} must be immutable 40/64-hex`);
  }
  return result;
}

function identifier(value: unknown, path: string, max: number): string {
  const result = text(value, path, max);
  if (!/^[a-z0-9][a-z0-9._:@/-]*$/.test(result)) {
    fail('hsme_foundation_run_identifier_invalid', `${path} is invalid`);
  }
  return result;
}

function text(value: unknown, path: string, max: number): string {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > max
    || value.trim() !== value
    || /[\u0000-\u001f\u007f]/.test(value)
  ) {
    fail('hsme_foundation_run_text_invalid', `${path} is invalid`);
  }
  return value;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail('hsme_foundation_run_boolean_invalid', `${path} must be boolean`);
  return value;
}

function safeInteger(value: unknown, path: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    fail('hsme_foundation_run_integer_invalid', `${path} is invalid`);
  }
  return value as number;
}

function integerSet(value: unknown, path: string, minCount: number, maxCount: number): readonly number[] {
  if (!Array.isArray(value) || value.length < minCount || value.length > maxCount) {
    fail('hsme_foundation_run_integer_set_invalid', `${path} must contain ${minCount}..${maxCount} integers`);
  }
  const result = value.map((item, index) => safeInteger(item, `${path}[${index}]`, 0, 0xFFFFFFFF));
  if (new Set(result).size !== result.length) {
    fail('hsme_foundation_run_integer_set_duplicate', `${path} must be unique`);
  }
  return Object.freeze([...result].sort((a, b) => a - b));
}

function compareOutputs(left: HsmeFoundationBenchmarkOutputRecordV1, right: HsmeFoundationBenchmarkOutputRecordV1): number {
  return lexical(left.fixtureId, right.fixtureId)
    || left.seed - right.seed
    || lexical(left.blindId, right.blindId);
}

function compareRuns(left: HsmeFoundationBenchmarkCandidateRunV1, right: HsmeFoundationBenchmarkCandidateRunV1): number {
  return lexical(left.candidateId, right.candidateId) || lexical(left.capability, right.capability);
}

function sameNumbers(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function lexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function fail(code: string, message: string): never {
  throw new HsmeFoundationBenchmarkRunEvidenceV1Error(code, message);
}
