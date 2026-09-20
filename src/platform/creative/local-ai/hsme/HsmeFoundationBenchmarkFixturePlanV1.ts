export const HSME_FOUNDATION_FIXTURE_PLAN_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_FIXTURE_PLAN_V1' as const;
export const HSME_FOUNDATION_FIXTURE_PLAN_V1_DIGEST_DOMAIN =
  'bers:hsme:foundation-fixture-plan:v1\0' as const;

export const HSME_TINY_SD_D6_CORPUS_PATH =
  'tests/fixtures/tiny-sd-d6-quality-corpus-v1.json' as const;
export const HSME_TINY_SD_D6_CORPUS_SHA256 =
  'ce8bb069c7d3d99b56c97a19c415fca9a4d7643c9d04a1b75e225e3b948199fe' as const;

const PLAN_STATES = Object.freeze(['EVIDENCE_PENDING', 'PINNED'] as const);
const CAPABILITIES = Object.freeze(['TEXT_TO_IMAGE', 'IMAGE_EDITING'] as const);
const SOURCE_CLASSES = Object.freeze([
  'EXISTING_PINNED_CORPUS',
  'PUBLIC_LICENSED_ASSET',
  'GENERATED_FIXTURE_ASSET',
] as const);
const RIGHTS = Object.freeze(['ADMITTED', 'PENDING'] as const);
const REVIEW_MODES = Object.freeze(['AUTOMATED', 'BLINDED_HUMAN', 'HYBRID'] as const);
const THRESHOLD_STATES = Object.freeze(['PIN_REQUIRED', 'PINNED'] as const);

const T2I_CASE_CLASSES = Object.freeze([
  'people-anatomy',
  'fashion-material',
  'text-logo-rendering',
  'count-spatial',
  'product-object',
  'difficult-texture',
] as const);

const EDIT_CASE_CLASSES = Object.freeze([
  'identity-preservation',
  'garment-detail-preservation',
  'logo-text-editing',
  'pattern-texture-material-preservation',
  'non-target-preservation',
  'localized-edit-compliance',
  'multi-reference-consistency',
] as const);

const DIMENSIONS = Object.freeze([
  'semantic-adherence',
  'identity-preservation',
  'garment-logo-pattern-preservation',
  'non-target-preservation',
  'anatomy-artifact-rate',
  'photorealism',
  'material-realism',
  'text-fidelity',
  'edit-compliance',
  'multi-reference-consistency',
  'composition-count-spatial-correctness',
] as const);

const HEX64 = /^[0-9a-f]{64}$/;

type PlanState = typeof PLAN_STATES[number];
type Capability = typeof CAPABILITIES[number];
type SourceClass = typeof SOURCE_CLASSES[number];
type Rights = typeof RIGHTS[number];
type ReviewMode = typeof REVIEW_MODES[number];
type ThresholdState = typeof THRESHOLD_STATES[number];
type Dimension = typeof DIMENSIONS[number];

export type HsmeFoundationFixtureAssetV1 = Readonly<{
  fixtureId: string;
  capability: Capability;
  caseClass: string;
  sourceClass: SourceClass;
  contentSha256: string | 'UNKNOWN';
  sourceRef: string;
  licenseId: string;
  licenseEvidenceSha256: string | 'UNKNOWN';
  rightsConclusion: Rights;
  preprocessingSha256: string | 'UNKNOWN';
  promptOrInstructionSha256: string | 'UNKNOWN';
}>;

export type HsmeFoundationFixtureDimensionV1 = Readonly<{
  dimensionId: Dimension;
  reviewMode: ReviewMode;
  scalePolicySha256: string | 'UNKNOWN';
  rubricSha256: string | 'UNKNOWN';
  thresholdState: ThresholdState;
  maxLossMicrounits: number | 'PIN_REQUIRED';
}>;

export type HsmeFoundationFixturePlanV1 = Readonly<{
  schemaVersion: typeof HSME_FOUNDATION_FIXTURE_PLAN_V1_SCHEMA;
  planId: string;
  campaignId: string;
  state: PlanState;
  reusedT2iCorpus: Readonly<{
    path: typeof HSME_TINY_SD_D6_CORPUS_PATH;
    sha256: typeof HSME_TINY_SD_D6_CORPUS_SHA256;
  }>;
  assets: readonly HsmeFoundationFixtureAssetV1[];
  dimensions: readonly HsmeFoundationFixtureDimensionV1[];
  privateUserDataAllowed: false;
  candidateOutputsObserved: false;
  postObservationMutationAllowed: false;
  ordinaryCiModelExecutionAllowed: false;
}>;

export interface HsmeFoundationFixtureHashPortV1 {
  sha256(bytes: Uint8Array): Promise<string>;
}

export class HsmeFoundationFixturePlanV1Error extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'HsmeFoundationFixturePlanV1Error';
    this.code = code;
  }
}

/**
 * Pre-observation fixture/rubric substrate for HSME foundation comparison.
 *
 * This contract deliberately reuses the accepted Tiny-SD D6 prompt corpus by
 * digest and adds only the missing fashion/edit coverage. It grants no model
 * execution authority and cannot be PINNED after candidate outputs are seen.
 */
export function normalizeHsmeFoundationFixturePlanV1(raw: unknown): HsmeFoundationFixturePlanV1 {
  const record = exactRecord(raw, [
    'schemaVersion',
    'planId',
    'campaignId',
    'state',
    'reusedT2iCorpus',
    'assets',
    'dimensions',
    'privateUserDataAllowed',
    'candidateOutputsObserved',
    'postObservationMutationAllowed',
    'ordinaryCiModelExecutionAllowed',
  ], 'fixturePlan');

  if (record.schemaVersion !== HSME_FOUNDATION_FIXTURE_PLAN_V1_SCHEMA) {
    fail('hsme_fixture_plan_schema_unsupported', 'unsupported fixture plan schema');
  }
  if (record.privateUserDataAllowed !== false) {
    fail('hsme_fixture_private_user_data_forbidden', 'private user data cannot enter benchmark fixtures');
  }
  if (record.candidateOutputsObserved !== false) {
    fail('hsme_fixture_candidate_outputs_pre_freeze_forbidden', 'fixture plan must freeze before candidate outputs are observed');
  }
  if (record.postObservationMutationAllowed !== false) {
    fail('hsme_fixture_post_observation_mutation_forbidden', 'post-observation fixture mutation must remain false');
  }
  if (record.ordinaryCiModelExecutionAllowed !== false) {
    fail('hsme_fixture_ci_model_execution_forbidden', 'ordinary CI cannot execute benchmark models');
  }

  const state = enumValue(record.state, PLAN_STATES, 'state');
  const reused = exactRecord(record.reusedT2iCorpus, ['path', 'sha256'], 'reusedT2iCorpus');
  if (reused.path !== HSME_TINY_SD_D6_CORPUS_PATH || reused.sha256 !== HSME_TINY_SD_D6_CORPUS_SHA256) {
    fail('hsme_fixture_d6_binding_invalid', 'fixture plan must reuse the accepted Tiny-SD D6 corpus by exact path and digest');
  }

  if (!Array.isArray(record.assets) || record.assets.length > 512) {
    fail('hsme_fixture_asset_count_invalid', 'assets must contain 0..512 entries');
  }
  const assets = record.assets.map((value, index) => normalizeAsset(value, `assets[${index}]`));
  const fixtureIds = assets.map(asset => asset.fixtureId);
  if (new Set(fixtureIds).size !== fixtureIds.length) {
    fail('hsme_fixture_asset_duplicate', 'fixtureId must be unique');
  }

  if (!Array.isArray(record.dimensions) || record.dimensions.length < 11 || record.dimensions.length > DIMENSIONS.length) {
    fail('hsme_fixture_dimension_count_invalid', 'all canonical benchmark dimensions are required');
  }
  const dimensions = record.dimensions.map((value, index) => normalizeDimension(value, `dimensions[${index}]`));
  const dimensionIds = dimensions.map(value => value.dimensionId);
  if (new Set(dimensionIds).size !== dimensionIds.length) {
    fail('hsme_fixture_dimension_duplicate', 'dimension ids must be unique');
  }
  for (const dimensionId of DIMENSIONS) {
    if (!dimensionIds.includes(dimensionId)) {
      fail('hsme_fixture_dimension_missing', `missing canonical dimension ${dimensionId}`);
    }
  }

  if (state === 'PINNED') {
    requireCaseCoverage(assets, 'TEXT_TO_IMAGE', T2I_CASE_CLASSES);
    requireCaseCoverage(assets, 'IMAGE_EDITING', EDIT_CASE_CLASSES);
    for (const asset of assets) {
      if (
        asset.contentSha256 === 'UNKNOWN'
        || asset.licenseEvidenceSha256 === 'UNKNOWN'
        || asset.preprocessingSha256 === 'UNKNOWN'
        || asset.promptOrInstructionSha256 === 'UNKNOWN'
        || asset.rightsConclusion !== 'ADMITTED'
      ) {
        fail('hsme_fixture_asset_pin_incomplete', `${asset.fixtureId} is not fully pinned/admitted`);
      }
    }
    for (const dimension of dimensions) {
      if (
        dimension.scalePolicySha256 === 'UNKNOWN'
        || dimension.rubricSha256 === 'UNKNOWN'
        || dimension.thresholdState !== 'PINNED'
        || dimension.maxLossMicrounits === 'PIN_REQUIRED'
      ) {
        fail('hsme_fixture_dimension_pin_incomplete', `${dimension.dimensionId} scale/rubric/threshold is not pinned`);
      }
    }
  }

  return deepFreeze({
    schemaVersion: HSME_FOUNDATION_FIXTURE_PLAN_V1_SCHEMA,
    planId: identifier(record.planId, 'planId', 120),
    campaignId: identifier(record.campaignId, 'campaignId', 120),
    state,
    reusedT2iCorpus: Object.freeze({
      path: HSME_TINY_SD_D6_CORPUS_PATH,
      sha256: HSME_TINY_SD_D6_CORPUS_SHA256,
    }),
    assets: Object.freeze([...assets].sort((left, right) => lexical(left.fixtureId, right.fixtureId))),
    dimensions: Object.freeze([...dimensions]),
    privateUserDataAllowed: false,
    candidateOutputsObserved: false,
    postObservationMutationAllowed: false,
    ordinaryCiModelExecutionAllowed: false,
  });
}

export function hsmeFoundationFixturePlanMayFreezeV1(raw: unknown): boolean {
  try {
    const plan = normalizeHsmeFoundationFixturePlanV1({
      ...(raw as Record<string, unknown>),
      state: 'PINNED',
    });
    return plan.state === 'PINNED';
  } catch {
    return false;
  }
}

export function serializeHsmeFoundationFixturePlanV1(raw: unknown): string {
  return JSON.stringify(normalizeHsmeFoundationFixturePlanV1(raw));
}

export async function hsmeFoundationFixturePlanDigestV1(
  raw: unknown,
  hashPort: HsmeFoundationFixtureHashPortV1,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    `${HSME_FOUNDATION_FIXTURE_PLAN_V1_DIGEST_DOMAIN}${serializeHsmeFoundationFixturePlanV1(raw)}`,
  );
  const digest = await hashPort.sha256(bytes);
  if (!HEX64.test(digest)) {
    fail('hsme_fixture_hash_port_invalid', 'hash port must return lowercase SHA-256');
  }
  return digest;
}

function normalizeAsset(raw: unknown, path: string): HsmeFoundationFixtureAssetV1 {
  const record = exactRecord(raw, [
    'fixtureId',
    'capability',
    'caseClass',
    'sourceClass',
    'contentSha256',
    'sourceRef',
    'licenseId',
    'licenseEvidenceSha256',
    'rightsConclusion',
    'preprocessingSha256',
    'promptOrInstructionSha256',
  ], path);
  return Object.freeze({
    fixtureId: identifier(record.fixtureId, `${path}.fixtureId`, 120),
    capability: enumValue(record.capability, CAPABILITIES, `${path}.capability`),
    caseClass: identifier(record.caseClass, `${path}.caseClass`, 120),
    sourceClass: enumValue(record.sourceClass, SOURCE_CLASSES, `${path}.sourceClass`),
    contentSha256: unknownOrSha256(record.contentSha256, `${path}.contentSha256`),
    sourceRef: text(record.sourceRef, `${path}.sourceRef`, 600),
    licenseId: text(record.licenseId, `${path}.licenseId`, 160),
    licenseEvidenceSha256: unknownOrSha256(record.licenseEvidenceSha256, `${path}.licenseEvidenceSha256`),
    rightsConclusion: enumValue(record.rightsConclusion, RIGHTS, `${path}.rightsConclusion`),
    preprocessingSha256: unknownOrSha256(record.preprocessingSha256, `${path}.preprocessingSha256`),
    promptOrInstructionSha256: unknownOrSha256(record.promptOrInstructionSha256, `${path}.promptOrInstructionSha256`),
  });
}

function normalizeDimension(raw: unknown, path: string): HsmeFoundationFixtureDimensionV1 {
  const record = exactRecord(raw, [
    'dimensionId',
    'reviewMode',
    'scalePolicySha256',
    'rubricSha256',
    'thresholdState',
    'maxLossMicrounits',
  ], path);
  const thresholdState = enumValue(record.thresholdState, THRESHOLD_STATES, `${path}.thresholdState`);
  const maxLossMicrounits = record.maxLossMicrounits === 'PIN_REQUIRED'
    ? 'PIN_REQUIRED'
    : safeInteger(record.maxLossMicrounits, `${path}.maxLossMicrounits`, 0, 1_000_000_000);
  if (thresholdState === 'PIN_REQUIRED' && maxLossMicrounits !== 'PIN_REQUIRED') {
    fail('hsme_fixture_threshold_state_mismatch', `${path} cannot carry numeric threshold while PIN_REQUIRED`);
  }
  if (thresholdState === 'PINNED' && maxLossMicrounits === 'PIN_REQUIRED') {
    fail('hsme_fixture_threshold_missing', `${path} PINNED threshold requires numeric value`);
  }
  return Object.freeze({
    dimensionId: enumValue(record.dimensionId, DIMENSIONS, `${path}.dimensionId`),
    reviewMode: enumValue(record.reviewMode, REVIEW_MODES, `${path}.reviewMode`),
    scalePolicySha256: unknownOrSha256(record.scalePolicySha256, `${path}.scalePolicySha256`),
    rubricSha256: unknownOrSha256(record.rubricSha256, `${path}.rubricSha256`),
    thresholdState,
    maxLossMicrounits,
  });
}

function requireCaseCoverage(
  assets: readonly HsmeFoundationFixtureAssetV1[],
  capability: Capability,
  required: readonly string[],
): void {
  const covered = new Set(
    assets.filter(asset => asset.capability === capability).map(asset => asset.caseClass),
  );
  for (const caseClass of required) {
    if (!covered.has(caseClass)) {
      fail('hsme_fixture_case_coverage_missing', `${capability} missing required case class ${caseClass}`);
    }
  }
}

function exactRecord(raw: unknown, allowed: readonly string[], path: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('hsme_fixture_record_invalid', `${path} must be an object`);
  }
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) fail('hsme_fixture_field_unknown', `${path}.${key} is not allowed`);
  }
  for (const key of allowed) {
    if (!Object.hasOwn(record, key)) fail('hsme_fixture_field_missing', `${path}.${key} is required`);
  }
  return record;
}

function enumValue<T extends readonly string[]>(value: unknown, values: T, path: string): T[number] {
  if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) {
    fail('hsme_fixture_enum_invalid', `${path} is invalid`);
  }
  return value as T[number];
}

function unknownOrSha256(value: unknown, path: string): string | 'UNKNOWN' {
  return value === 'UNKNOWN' ? 'UNKNOWN' : sha256(value, path);
}

function sha256(value: unknown, path: string): string {
  const result = text(value, path, 64);
  if (!HEX64.test(result)) fail('hsme_fixture_hash_invalid', `${path} must be lowercase SHA-256`);
  return result;
}

function identifier(value: unknown, path: string, max: number): string {
  const result = text(value, path, max);
  if (!/^[a-z0-9][a-z0-9._:@/-]*$/.test(result)) {
    fail('hsme_fixture_identifier_invalid', `${path} is invalid`);
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
    fail('hsme_fixture_text_invalid', `${path} is invalid`);
  }
  return value;
}

function safeInteger(value: unknown, path: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    fail('hsme_fixture_integer_invalid', `${path} is invalid`);
  }
  return value as number;
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
  throw new HsmeFoundationFixturePlanV1Error(code, message);
}
