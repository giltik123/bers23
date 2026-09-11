export const HSME_SANA_SPLIT_CONDITIONING_ENVELOPE_V1_SCHEMA = 'BERS_HSME_SANA_SPLIT_CONDITIONING_ENVELOPE_V1' as const;
export const HSME_SANA_SPLIT_CONDITIONING_EVIDENCE_V1_SCHEMA = 'BERS_HSME_SANA_SPLIT_CONDITIONING_EVIDENCE_V1' as const;
export const HSME_SANA_SPLIT_CONDITIONING_DIGEST_DOMAIN = 'bers:hsme:sana-split-conditioning-envelope:v1\0' as const;

export const HSME_SANA_SPLIT_BATCH_SIZE_V1 = 1 as const;
export const HSME_SANA_SPLIT_SEQUENCE_LENGTH_V1 = 300 as const;
export const HSME_SANA_SPLIT_CAPTION_CHANNELS_V1 = 2304 as const;
export const HSME_SANA_SPLIT_EMBEDDING_DTYPE_V1 = 'BF16_LE' as const;
export const HSME_SANA_SPLIT_ATTENTION_MASK_DTYPE_V1 = 'INT64_LE' as const;
export const HSME_SANA_SPLIT_EMBEDDING_BYTES_V1 = 1 * 300 * 2304 * 2;
export const HSME_SANA_SPLIT_ATTENTION_MASK_BYTES_V1 = 1 * 300 * 8;

const HEX64 = /^[0-9a-f]{64}$/;
const IMMUTABLE_REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

export type HsmeSanaSplitComponentIdentityV1 = Readonly<{
  sourceRoot: string;
  immutableRevision: string;
  contentSha256: string;
}>;

export type HsmeSanaSplitConditioningEnvelopeV1 = Readonly<{
  schemaVersion: typeof HSME_SANA_SPLIT_CONDITIONING_ENVELOPE_V1_SCHEMA;
  candidateId: 'sana-sprint-0.6b-split-conditioning';
  sanaCore: HsmeSanaSplitComponentIdentityV1;
  textEncoder: HsmeSanaSplitComponentIdentityV1;
  tokenizer: HsmeSanaSplitComponentIdentityV1;
  runtime: HsmeSanaSplitComponentIdentityV1;
  promptCommitmentKeyId: string;
  promptCommitmentHmacSha256: string;
  preprocessingPolicySha256: string;
  batchSize: typeof HSME_SANA_SPLIT_BATCH_SIZE_V1;
  sequenceLength: typeof HSME_SANA_SPLIT_SEQUENCE_LENGTH_V1;
  actualTokenCount: number;
  captionChannels: typeof HSME_SANA_SPLIT_CAPTION_CHANNELS_V1;
  embeddingDtype: typeof HSME_SANA_SPLIT_EMBEDDING_DTYPE_V1;
  embeddingByteLength: typeof HSME_SANA_SPLIT_EMBEDDING_BYTES_V1;
  embeddingSha256: string;
  attentionMaskDtype: typeof HSME_SANA_SPLIT_ATTENTION_MASK_DTYPE_V1;
  attentionMaskByteLength: typeof HSME_SANA_SPLIT_ATTENTION_MASK_BYTES_V1;
  attentionMaskSha256: string;
  rawPromptPersisted: false;
  modelRepositoryRuntimeCodeExecuted: false;
  runtimeAuthorityGranted: false;
  binaryPayloadPublished: false;
}>;

export type HsmeSanaSplitConditioningEvidenceV1 = Readonly<{
  schemaVersion: typeof HSME_SANA_SPLIT_CONDITIONING_EVIDENCE_V1_SCHEMA;
  envelopeDigest: string;
  embeddingSha256: string;
  attentionMaskSha256: string;
  embeddingBytesVerified: true;
  attentionMaskBytesVerified: true;
  attentionMaskBinaryVerified: true;
  attentionMaskRightPaddedVerified: true;
  actualTokenCountVerified: true;
  noLocalTextEncoderAuthorityGranted: true;
}>;

export interface HsmeSanaSplitConditioningHashPortV1 {
  sha256(bytes: Uint8Array): Promise<string>;
}

export interface HsmeSanaSplitConditioningPromptCommitmentPortV1 {
  readonly keyId: string;
  hmacSha256(promptUtf8: Uint8Array): Promise<string>;
}

export class HsmeSanaSplitConditioningEnvelopeV1Error extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'HsmeSanaSplitConditioningEnvelopeV1Error';
    this.code = code;
  }
}

/**
 * Evidence-only contract for the zero-training split-conditioning experiment.
 * It proves tensor identity and shape; it grants no production/runtime/model
 * authority and intentionally never accepts or persists the raw prompt.
 */
export function normalizeHsmeSanaSplitConditioningEnvelopeV1(raw: unknown): HsmeSanaSplitConditioningEnvelopeV1 {
  const record = exactRecord(
    raw,
    [
      'schemaVersion', 'candidateId', 'sanaCore', 'textEncoder', 'tokenizer', 'runtime',
      'promptCommitmentKeyId', 'promptCommitmentHmacSha256', 'preprocessingPolicySha256',
      'batchSize', 'sequenceLength', 'actualTokenCount', 'captionChannels', 'embeddingDtype',
      'embeddingByteLength', 'embeddingSha256', 'attentionMaskDtype', 'attentionMaskByteLength',
      'attentionMaskSha256', 'rawPromptPersisted', 'modelRepositoryRuntimeCodeExecuted',
      'runtimeAuthorityGranted', 'binaryPayloadPublished',
    ],
    [
      'schemaVersion', 'candidateId', 'sanaCore', 'textEncoder', 'tokenizer', 'runtime',
      'promptCommitmentKeyId', 'promptCommitmentHmacSha256', 'preprocessingPolicySha256',
      'batchSize', 'sequenceLength', 'actualTokenCount', 'captionChannels', 'embeddingDtype',
      'embeddingByteLength', 'embeddingSha256', 'attentionMaskDtype', 'attentionMaskByteLength',
      'attentionMaskSha256', 'rawPromptPersisted', 'modelRepositoryRuntimeCodeExecuted',
      'runtimeAuthorityGranted', 'binaryPayloadPublished',
    ],
    'envelope',
  );

  if (record.schemaVersion !== HSME_SANA_SPLIT_CONDITIONING_ENVELOPE_V1_SCHEMA) {
    fail('hsme_sana_split_schema_unsupported', `schemaVersion must be ${HSME_SANA_SPLIT_CONDITIONING_ENVELOPE_V1_SCHEMA}`);
  }
  if (record.candidateId !== 'sana-sprint-0.6b-split-conditioning') {
    fail('hsme_sana_split_candidate_invalid', 'candidateId must identify the pinned SANA-Sprint 0.6B split-conditioning experiment');
  }

  const sanaCore = normalizeIdentity(record.sanaCore, 'envelope.sanaCore');
  const textEncoder = normalizeIdentity(record.textEncoder, 'envelope.textEncoder');
  const tokenizer = normalizeIdentity(record.tokenizer, 'envelope.tokenizer');
  const runtime = normalizeIdentity(record.runtime, 'envelope.runtime');

  const promptCommitmentKeyId = boundedString(record.promptCommitmentKeyId, 'envelope.promptCommitmentKeyId', 128);
  const promptCommitmentHmacSha256 = sha256(record.promptCommitmentHmacSha256, 'envelope.promptCommitmentHmacSha256');
  const preprocessingPolicySha256 = sha256(record.preprocessingPolicySha256, 'envelope.preprocessingPolicySha256');
  literalInteger(record.batchSize, HSME_SANA_SPLIT_BATCH_SIZE_V1, 'envelope.batchSize');
  literalInteger(record.sequenceLength, HSME_SANA_SPLIT_SEQUENCE_LENGTH_V1, 'envelope.sequenceLength');
  const actualTokenCount = safeInteger(record.actualTokenCount, 'envelope.actualTokenCount', 1, HSME_SANA_SPLIT_SEQUENCE_LENGTH_V1);
  literalInteger(record.captionChannels, HSME_SANA_SPLIT_CAPTION_CHANNELS_V1, 'envelope.captionChannels');

  if (record.embeddingDtype !== HSME_SANA_SPLIT_EMBEDDING_DTYPE_V1) {
    fail('hsme_sana_split_embedding_dtype_invalid', `embeddingDtype must be ${HSME_SANA_SPLIT_EMBEDDING_DTYPE_V1}`);
  }
  literalInteger(record.embeddingByteLength, HSME_SANA_SPLIT_EMBEDDING_BYTES_V1, 'envelope.embeddingByteLength');
  const embeddingSha256 = sha256(record.embeddingSha256, 'envelope.embeddingSha256');

  if (record.attentionMaskDtype !== HSME_SANA_SPLIT_ATTENTION_MASK_DTYPE_V1) {
    fail('hsme_sana_split_attention_mask_dtype_invalid', `attentionMaskDtype must be ${HSME_SANA_SPLIT_ATTENTION_MASK_DTYPE_V1}`);
  }
  literalInteger(record.attentionMaskByteLength, HSME_SANA_SPLIT_ATTENTION_MASK_BYTES_V1, 'envelope.attentionMaskByteLength');
  const attentionMaskSha256 = sha256(record.attentionMaskSha256, 'envelope.attentionMaskSha256');

  assertFalse(record.rawPromptPersisted, 'rawPromptPersisted', 'hsme_sana_split_raw_prompt_persistence_forbidden');
  assertFalse(record.modelRepositoryRuntimeCodeExecuted, 'modelRepositoryRuntimeCodeExecuted', 'hsme_sana_split_remote_code_forbidden');
  assertFalse(record.runtimeAuthorityGranted, 'runtimeAuthorityGranted', 'hsme_sana_split_runtime_authority_forbidden');
  assertFalse(record.binaryPayloadPublished, 'binaryPayloadPublished', 'hsme_sana_split_binary_publication_forbidden');

  return deepFreeze({
    schemaVersion: HSME_SANA_SPLIT_CONDITIONING_ENVELOPE_V1_SCHEMA,
    candidateId: 'sana-sprint-0.6b-split-conditioning',
    sanaCore,
    textEncoder,
    tokenizer,
    runtime,
    promptCommitmentKeyId,
    promptCommitmentHmacSha256,
    preprocessingPolicySha256,
    batchSize: HSME_SANA_SPLIT_BATCH_SIZE_V1,
    sequenceLength: HSME_SANA_SPLIT_SEQUENCE_LENGTH_V1,
    actualTokenCount,
    captionChannels: HSME_SANA_SPLIT_CAPTION_CHANNELS_V1,
    embeddingDtype: HSME_SANA_SPLIT_EMBEDDING_DTYPE_V1,
    embeddingByteLength: HSME_SANA_SPLIT_EMBEDDING_BYTES_V1,
    embeddingSha256,
    attentionMaskDtype: HSME_SANA_SPLIT_ATTENTION_MASK_DTYPE_V1,
    attentionMaskByteLength: HSME_SANA_SPLIT_ATTENTION_MASK_BYTES_V1,
    attentionMaskSha256,
    rawPromptPersisted: false,
    modelRepositoryRuntimeCodeExecuted: false,
    runtimeAuthorityGranted: false,
    binaryPayloadPublished: false,
  });
}

export async function hsmeSanaSplitConditioningPromptCommitmentV1(
  prompt: string,
  port: HsmeSanaSplitConditioningPromptCommitmentPortV1,
): Promise<Readonly<{ keyId: string; hmacSha256: string }>> {
  if (typeof prompt !== 'string' || prompt.length < 1 || prompt.length > 16_384 || prompt.trim() !== prompt || /[\u0000-\u001f\u007f]/.test(prompt)) {
    fail('hsme_sana_split_prompt_invalid', 'prompt is invalid for transient commitment');
  }
  const keyId = boundedString(port?.keyId, 'promptCommitment.keyId', 128);
  const digest = await port.hmacSha256(new TextEncoder().encode(prompt));
  if (!HEX64.test(digest)) {
    fail('hsme_sana_split_prompt_commitment_invalid', 'prompt commitment port must return lowercase SHA-256 HMAC hex');
  }
  return deepFreeze({ keyId, hmacSha256: digest });
}

export async function hsmeSanaSplitConditioningEnvelopeV1Digest(
  raw: unknown,
  hash: HsmeSanaSplitConditioningHashPortV1,
): Promise<string> {
  const envelope = normalizeHsmeSanaSplitConditioningEnvelopeV1(raw);
  const bytes = new TextEncoder().encode(`${HSME_SANA_SPLIT_CONDITIONING_DIGEST_DOMAIN}${JSON.stringify(envelope)}`);
  const digest = await hash.sha256(bytes);
  if (!HEX64.test(digest)) {
    fail('hsme_sana_split_hash_port_invalid', 'hash port must return lowercase SHA-256 hex');
  }
  return digest;
}

export async function proveHsmeSanaSplitConditioningEnvelopeV1(
  raw: unknown,
  embeddingBytes: Uint8Array,
  attentionMaskBytes: Uint8Array,
  hash: HsmeSanaSplitConditioningHashPortV1,
): Promise<HsmeSanaSplitConditioningEvidenceV1> {
  const envelope = normalizeHsmeSanaSplitConditioningEnvelopeV1(raw);

  if (!(embeddingBytes instanceof Uint8Array) || embeddingBytes.byteLength !== envelope.embeddingByteLength) {
    fail('hsme_sana_split_embedding_bytes_invalid', `embedding bytes must be exactly ${envelope.embeddingByteLength} bytes`);
  }
  if (!(attentionMaskBytes instanceof Uint8Array) || attentionMaskBytes.byteLength !== envelope.attentionMaskByteLength) {
    fail('hsme_sana_split_attention_mask_bytes_invalid', `attention-mask bytes must be exactly ${envelope.attentionMaskByteLength} bytes`);
  }

  const [embeddingSha256, attentionMaskSha256, envelopeDigest] = await Promise.all([
    checkedDigest(embeddingBytes, hash),
    checkedDigest(attentionMaskBytes, hash),
    hsmeSanaSplitConditioningEnvelopeV1Digest(envelope, hash),
  ]);

  if (embeddingSha256 !== envelope.embeddingSha256) {
    fail('hsme_sana_split_embedding_hash_mismatch', 'embedding bytes do not match envelope SHA-256');
  }
  if (attentionMaskSha256 !== envelope.attentionMaskSha256) {
    fail('hsme_sana_split_attention_mask_hash_mismatch', 'attention-mask bytes do not match envelope SHA-256');
  }

  const tokenCount = countCanonicalRightPaddedInt64LittleEndianMask(attentionMaskBytes);
  if (tokenCount !== envelope.actualTokenCount) {
    fail('hsme_sana_split_actual_token_count_mismatch', 'actualTokenCount does not match the canonical attention mask');
  }

  return deepFreeze({
    schemaVersion: HSME_SANA_SPLIT_CONDITIONING_EVIDENCE_V1_SCHEMA,
    envelopeDigest,
    embeddingSha256,
    attentionMaskSha256,
    embeddingBytesVerified: true,
    attentionMaskBytesVerified: true,
    attentionMaskBinaryVerified: true,
    attentionMaskRightPaddedVerified: true,
    actualTokenCountVerified: true,
    noLocalTextEncoderAuthorityGranted: true,
  });
}

function countCanonicalRightPaddedInt64LittleEndianMask(bytes: Uint8Array): number {
  if (bytes.byteLength % 8 !== 0) {
    fail('hsme_sana_split_attention_mask_alignment_invalid', 'INT64_LE attention mask must be 8-byte aligned');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let count = 0;
  let paddingStarted = false;
  for (let offset = 0; offset < bytes.byteLength; offset += 8) {
    const value = view.getBigInt64(offset, true);
    if (value !== 0n && value !== 1n) {
      fail('hsme_sana_split_attention_mask_non_binary', 'attention mask values must be canonical INT64 0 or 1');
    }
    if (value === 0n) {
      paddingStarted = true;
      continue;
    }
    if (paddingStarted) {
      fail('hsme_sana_split_attention_mask_not_right_padded', 'attention mask must be canonical right-padded 1...1 0...0');
    }
    count += 1;
  }
  return count;
}

async function checkedDigest(bytes: Uint8Array, hash: HsmeSanaSplitConditioningHashPortV1): Promise<string> {
  const digest = await hash.sha256(bytes);
  if (!HEX64.test(digest)) {
    fail('hsme_sana_split_hash_port_invalid', 'hash port must return lowercase SHA-256 hex');
  }
  return digest;
}

function normalizeIdentity(raw: unknown, path: string): HsmeSanaSplitComponentIdentityV1 {
  const record = exactRecord(raw, ['sourceRoot', 'immutableRevision', 'contentSha256'], ['sourceRoot', 'immutableRevision', 'contentSha256'], path);
  const sourceRoot = boundedString(record.sourceRoot, `${path}.sourceRoot`, 240);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(sourceRoot)) {
    fail('hsme_sana_split_source_invalid', `${path}.sourceRoot must be owner/name`);
  }
  const immutableRevision = boundedString(record.immutableRevision, `${path}.immutableRevision`, 64);
  if (!IMMUTABLE_REVISION.test(immutableRevision)) {
    fail('hsme_sana_split_revision_invalid', `${path}.immutableRevision must be immutable 40/64-hex`);
  }
  return Object.freeze({
    sourceRoot,
    immutableRevision,
    contentSha256: sha256(record.contentSha256, `${path}.contentSha256`),
  });
}

function exactRecord(raw: unknown, allowed: readonly string[], required: readonly string[], path: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('hsme_sana_split_record_invalid', `${path} must be an object`);
  }
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) fail('hsme_sana_split_field_unknown', `${path}.${key} is not allowed`);
  }
  for (const key of required) {
    if (!Object.hasOwn(record, key)) fail('hsme_sana_split_field_missing', `${path}.${key} is required`);
  }
  return record;
}

function sha256(value: unknown, path: string): string {
  const result = boundedString(value, path, 64);
  if (!HEX64.test(result)) fail('hsme_sana_split_hash_invalid', `${path} must be lowercase SHA-256`);
  return result;
}

function boundedString(value: unknown, path: string, max: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) {
    fail('hsme_sana_split_text_invalid', `${path} is invalid`);
  }
  return value;
}

function safeInteger(value: unknown, path: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    fail('hsme_sana_split_integer_invalid', `${path} is invalid`);
  }
  return value as number;
}

function literalInteger(value: unknown, expected: number, path: string): void {
  if (value !== expected) fail('hsme_sana_split_shape_contract_invalid', `${path} must equal ${expected}`);
}

function assertFalse(value: unknown, field: string, code: string): void {
  if (value !== false) fail(code, `${field} must be false`);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function fail(code: string, message: string): never {
  throw new HsmeSanaSplitConditioningEnvelopeV1Error(code, message);
}
