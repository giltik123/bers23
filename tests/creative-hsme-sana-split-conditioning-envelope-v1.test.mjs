import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import test from 'node:test';
import {
  HSME_SANA_SPLIT_ATTENTION_MASK_BYTES_V1,
  HSME_SANA_SPLIT_CONDITIONING_ENVELOPE_V1_SCHEMA,
  HSME_SANA_SPLIT_CONDITIONING_EVIDENCE_V1_SCHEMA,
  HSME_SANA_SPLIT_EMBEDDING_BYTES_V1,
  hsmeSanaSplitConditioningEnvelopeV1Digest,
  hsmeSanaSplitConditioningPromptCommitmentV1,
  normalizeHsmeSanaSplitConditioningEnvelopeV1,
  proveHsmeSanaSplitConditioningEnvelopeV1,
} from '../src/platform/creative/local-ai/hsme/HsmeSanaSplitConditioningEnvelopeV1.ts';

const H = char => char.repeat(64);
const R = char => char.repeat(40);
const promptKey = Buffer.from('test-only-hsme-sana-prompt-key');
const hashPort = { sha256: async bytes => createHash('sha256').update(bytes).digest('hex') };
const promptCommitmentPort = {
  keyId: 'test-hsme-prompt-key-v1',
  hmacSha256: async bytes => createHmac('sha256', promptKey).update(bytes).digest('hex'),
};

function identity(sourceRoot, revisionChar, hashChar) {
  return { sourceRoot, immutableRevision: R(revisionChar), contentSha256: H(hashChar) };
}

function makeEmbeddingBytes() {
  const bytes = new Uint8Array(HSME_SANA_SPLIT_EMBEDDING_BYTES_V1);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = (index * 17 + 29) % 251;
  return bytes;
}

function makeMaskBytes(tokenCount = 42) {
  const bytes = new Uint8Array(HSME_SANA_SPLIT_ATTENTION_MASK_BYTES_V1);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < 300; index += 1) view.setBigInt64(index * 8, index < tokenCount ? 1n : 0n, true);
  return bytes;
}

async function fixture(tokenCount = 42) {
  const embeddingBytes = makeEmbeddingBytes();
  const attentionMaskBytes = makeMaskBytes(tokenCount);
  const promptCommitment = await hsmeSanaSplitConditioningPromptCommitmentV1('a private fixture prompt', promptCommitmentPort);
  const envelope = {
    schemaVersion: HSME_SANA_SPLIT_CONDITIONING_ENVELOPE_V1_SCHEMA,
    candidateId: 'sana-sprint-0.6b-split-conditioning',
    sanaCore: identity('Efficient-Large-Model/Sana_Sprint_0.6B_1024px_diffusers', 'a', '1'),
    textEncoder: identity('google/gemma-2-2b-it', 'b', '2'),
    tokenizer: identity('google/gemma-2-2b-it', 'b', '3'),
    runtime: identity('huggingface/diffusers', 'c', '4'),
    promptCommitmentKeyId: promptCommitment.keyId,
    promptCommitmentHmacSha256: promptCommitment.hmacSha256,
    preprocessingPolicySha256: H('6'),
    batchSize: 1,
    sequenceLength: 300,
    actualTokenCount: tokenCount,
    captionChannels: 2304,
    embeddingDtype: 'BF16_LE',
    embeddingByteLength: HSME_SANA_SPLIT_EMBEDDING_BYTES_V1,
    embeddingSha256: await hashPort.sha256(embeddingBytes),
    attentionMaskDtype: 'INT64_LE',
    attentionMaskByteLength: HSME_SANA_SPLIT_ATTENTION_MASK_BYTES_V1,
    attentionMaskSha256: await hashPort.sha256(attentionMaskBytes),
    rawPromptPersisted: false,
    modelRepositoryRuntimeCodeExecuted: false,
    runtimeAuthorityGranted: false,
    binaryPayloadPublished: false,
  };
  return { envelope, embeddingBytes, attentionMaskBytes };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, error => error?.code === code, `expected ${code}`);
}

function expectSyncCode(fn, code) {
  assert.throws(fn, error => error?.code === code, `expected ${code}`);
}

test('canonical split-conditioning envelope proves exact BF16 embedding and INT64 mask bytes', async () => {
  const { envelope, embeddingBytes, attentionMaskBytes } = await fixture();
  const evidence = await proveHsmeSanaSplitConditioningEnvelopeV1(envelope, embeddingBytes, attentionMaskBytes, hashPort);
  assert.equal(evidence.schemaVersion, HSME_SANA_SPLIT_CONDITIONING_EVIDENCE_V1_SCHEMA);
  assert.equal(evidence.embeddingBytesVerified, true);
  assert.equal(evidence.attentionMaskBytesVerified, true);
  assert.equal(evidence.attentionMaskBinaryVerified, true);
  assert.equal(evidence.attentionMaskRightPaddedVerified, true);
  assert.equal(evidence.actualTokenCountVerified, true);
  assert.equal(evidence.noLocalTextEncoderAuthorityGranted, true);
  assert.equal(evidence.embeddingSha256, envelope.embeddingSha256);
  assert.equal(evidence.attentionMaskSha256, envelope.attentionMaskSha256);
});

test('canonical payload size is fixed to one 300x2304 BF16 prompt embedding plus 300 INT64 mask entries', async () => {
  const { envelope } = await fixture();
  const normalized = normalizeHsmeSanaSplitConditioningEnvelopeV1(envelope);
  assert.equal(normalized.embeddingByteLength, 1_382_400);
  assert.equal(normalized.attentionMaskByteLength, 2_400);
  assert.equal(normalized.batchSize, 1);
  assert.equal(normalized.sequenceLength, 300);
  assert.equal(normalized.captionChannels, 2304);
});

test('prompt identity uses a keyed HMAC commitment and never stores raw prompt text', async () => {
  const commitment = await hsmeSanaSplitConditioningPromptCommitmentV1('same semantic fixture', promptCommitmentPort);
  const expected = createHmac('sha256', promptKey).update('same semantic fixture').digest('hex');
  assert.equal(commitment.keyId, 'test-hsme-prompt-key-v1');
  assert.equal(commitment.hmacSha256, expected);
  const { envelope } = await fixture();
  assert.equal(Object.hasOwn(envelope, 'rawPrompt'), false);
  assert.equal(Object.hasOwn(envelope, 'promptSha256'), false);
});

test('one changed embedding byte fails before split conditioning can be admitted', async () => {
  const { envelope, embeddingBytes, attentionMaskBytes } = await fixture();
  embeddingBytes[100] ^= 0xff;
  await expectCode(proveHsmeSanaSplitConditioningEnvelopeV1(envelope, embeddingBytes, attentionMaskBytes, hashPort), 'hsme_sana_split_embedding_hash_mismatch');
});

test('one changed mask byte fails exact hash binding', async () => {
  const { envelope, embeddingBytes, attentionMaskBytes } = await fixture();
  attentionMaskBytes[0] = 0;
  await expectCode(proveHsmeSanaSplitConditioningEnvelopeV1(envelope, embeddingBytes, attentionMaskBytes, hashPort), 'hsme_sana_split_attention_mask_hash_mismatch');
});

test('mask must contain canonical INT64 little-endian zero or one values', async () => {
  const { envelope, embeddingBytes, attentionMaskBytes } = await fixture();
  const view = new DataView(attentionMaskBytes.buffer);
  view.setBigInt64(0, 2n, true);
  envelope.attentionMaskSha256 = await hashPort.sha256(attentionMaskBytes);
  await expectCode(proveHsmeSanaSplitConditioningEnvelopeV1(envelope, embeddingBytes, attentionMaskBytes, hashPort), 'hsme_sana_split_attention_mask_non_binary');
});

test('mask must be canonical right-padded after the first zero', async () => {
  const { envelope, embeddingBytes, attentionMaskBytes } = await fixture(42);
  const view = new DataView(attentionMaskBytes.buffer);
  view.setBigInt64(42 * 8, 1n, true);
  envelope.attentionMaskSha256 = await hashPort.sha256(attentionMaskBytes);
  await expectCode(proveHsmeSanaSplitConditioningEnvelopeV1(envelope, embeddingBytes, attentionMaskBytes, hashPort), 'hsme_sana_split_attention_mask_not_right_padded');
});

test('declared token count must equal the number of enabled canonical mask positions', async () => {
  const { envelope, embeddingBytes, attentionMaskBytes } = await fixture(42);
  envelope.actualTokenCount = 41;
  await expectCode(proveHsmeSanaSplitConditioningEnvelopeV1(envelope, embeddingBytes, attentionMaskBytes, hashPort), 'hsme_sana_split_actual_token_count_mismatch');
});

test('wrong embedding shape/byte length is rejected independently of its hash', async () => {
  const { envelope, attentionMaskBytes } = await fixture();
  const short = new Uint8Array(HSME_SANA_SPLIT_EMBEDDING_BYTES_V1 - 2);
  envelope.embeddingSha256 = await hashPort.sha256(short);
  await expectCode(proveHsmeSanaSplitConditioningEnvelopeV1(envelope, short, attentionMaskBytes, hashPort), 'hsme_sana_split_embedding_bytes_invalid');
});

test('raw prompt content is structurally forbidden from the evidence envelope', async () => {
  const { envelope } = await fixture();
  envelope.rawPrompt = 'this must never enter the evidence envelope';
  expectSyncCode(() => normalizeHsmeSanaSplitConditioningEnvelopeV1(envelope), 'hsme_sana_split_field_unknown');
});

test('authority, model-repository code execution and binary publication remain fail closed', async () => {
  for (const [field, code] of [
    ['runtimeAuthorityGranted', 'hsme_sana_split_runtime_authority_forbidden'],
    ['modelRepositoryRuntimeCodeExecuted', 'hsme_sana_split_remote_code_forbidden'],
    ['binaryPayloadPublished', 'hsme_sana_split_binary_publication_forbidden'],
    ['rawPromptPersisted', 'hsme_sana_split_raw_prompt_persistence_forbidden'],
  ]) {
    const { envelope } = await fixture();
    envelope[field] = true;
    expectSyncCode(() => normalizeHsmeSanaSplitConditioningEnvelopeV1(envelope), code);
  }
});

test('immutable component revision participates in the canonical conditioning identity', async () => {
  const { envelope } = await fixture();
  const first = await hsmeSanaSplitConditioningEnvelopeV1Digest(envelope, hashPort);
  envelope.runtime = { ...envelope.runtime, immutableRevision: R('d') };
  const second = await hsmeSanaSplitConditioningEnvelopeV1Digest(envelope, hashPort);
  assert.notEqual(first, second);
});

test('hash port itself is fail closed', async () => {
  const { envelope, embeddingBytes, attentionMaskBytes } = await fixture();
  const brokenHash = { sha256: async () => 'not-a-sha256' };
  await expectCode(proveHsmeSanaSplitConditioningEnvelopeV1(envelope, embeddingBytes, attentionMaskBytes, brokenHash), 'hsme_sana_split_hash_port_invalid');
});
