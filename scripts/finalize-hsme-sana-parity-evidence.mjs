import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import {
  hsmeSanaSplitConditioningEnvelopeV1Digest,
  proveHsmeSanaSplitConditioningEnvelopeV1,
} from '../src/platform/creative/local-ai/hsme/HsmeSanaSplitConditioningEnvelopeV1.ts';
import {
  hsmeSanaConditioningGenerationV1Digest,
  hsmeSanaConditioningParityPlanV1Digest,
  proveHsmeSanaConditioningParityEvidenceV1,
} from '../src/platform/creative/local-ai/hsme/HsmeSanaConditioningParityEvidenceV1.ts';

const hashPort = {
  sha256: async bytes => createHash('sha256').update(bytes).digest('hex'),
};

const [mode, ...args] = process.argv.slice(2);

if (mode === 'phase0') {
  const [envelopePath, embeddingPath, maskPath, outputPath] = args;
  if (!envelopePath || !embeddingPath || !maskPath || !outputPath) {
    throw new Error('usage: finalize ... phase0 <envelope.json> <embedding.bin> <mask.bin> <evidence.json>');
  }
  const envelope = JSON.parse(fs.readFileSync(envelopePath, 'utf8'));
  const embeddingBytes = new Uint8Array(fs.readFileSync(embeddingPath));
  const maskBytes = new Uint8Array(fs.readFileSync(maskPath));
  const evidence = await proveHsmeSanaSplitConditioningEnvelopeV1(
    envelope,
    embeddingBytes,
    maskBytes,
    hashPort,
  );
  fs.writeFileSync(outputPath, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  console.log('HSME_SANA_PHASE0_ENVELOPE_DIGEST=' + evidence.envelopeDigest);
} else if (mode === 'check-phase0-plan') {
  const [planPath, envelopePath, phase0EvidencePath] = args;
  if (!planPath || !envelopePath || !phase0EvidencePath) {
    throw new Error('usage: finalize ... check-phase0-plan <plan.json> <envelope.json> <phase0-evidence.json>');
  }
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const envelope = JSON.parse(fs.readFileSync(envelopePath, 'utf8'));
  const evidence = JSON.parse(fs.readFileSync(phase0EvidencePath, 'utf8'));
  const expectedDigest = await hsmeSanaSplitConditioningEnvelopeV1Digest(envelope, hashPort);
  assert.equal(plan.phase0EnvelopeDigest, expectedDigest);
  assert.equal(evidence.envelopeDigest, expectedDigest);
  assert.deepEqual(plan.sanaSnapshot, envelope.sanaCore);
  assert.deepEqual(plan.textEncoder, envelope.textEncoder);
  assert.deepEqual(plan.tokenizer, envelope.tokenizer);
  assert.deepEqual(plan.diffusersRuntime, envelope.runtime);
  assert.equal(plan.promptCommitmentKeyId, envelope.promptCommitmentKeyId);
  assert.equal(plan.promptCommitmentHmacSha256, envelope.promptCommitmentHmacSha256);
  assert.equal(evidence.embeddingSha256, envelope.embeddingSha256);
  assert.equal(evidence.attentionMaskSha256, envelope.attentionMaskSha256);
  assert.equal(evidence.embeddingBytesVerified, true);
  assert.equal(evidence.attentionMaskBytesVerified, true);
  assert.equal(evidence.attentionMaskRightPaddedVerified, true);
  assert.equal(evidence.actualTokenCountVerified, true);
  assert.equal(evidence.noLocalTextEncoderAuthorityGranted, true);
  console.log('HSME_SANA_PHASE0_PLAN_BINDING=PASS');
} else if (mode === 'parity') {
  const [planPath, envelopePath, evidencePath, outputPath] = args;
  if (!planPath || !envelopePath || !evidencePath || !outputPath) {
    throw new Error('usage: finalize ... parity <plan.json> <phase0-envelope.json> <candidate-evidence.json> <validated-evidence.json>');
  }
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const envelope = JSON.parse(fs.readFileSync(envelopePath, 'utf8'));
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));

  const [expectedPlanDigest, expectedGenerationDigest] = await Promise.all([
    hsmeSanaConditioningParityPlanV1Digest(plan, hashPort),
    hsmeSanaConditioningGenerationV1Digest(plan, hashPort),
  ]);

  const expectedPhase0Digest = await hsmeSanaSplitConditioningEnvelopeV1Digest(envelope, hashPort);
  assert.equal(plan.phase0EnvelopeDigest, expectedPhase0Digest);
  assert.equal(evidence.planDigest, expectedPlanDigest);
  assert.equal(evidence.generationConfigSha256, expectedGenerationDigest);
  assert.equal(evidence.phase0EnvelopeDigest, expectedPhase0Digest);
  assert.equal(evidence.referenceEmbeddingSha256, envelope.embeddingSha256);
  assert.equal(evidence.transportedEmbeddingSha256, envelope.embeddingSha256);
  assert.equal(evidence.referenceMaskSha256, envelope.attentionMaskSha256);
  assert.equal(evidence.transportedMaskSha256, envelope.attentionMaskSha256);
  assert.equal(evidence.binaryArtifactsPublished, false);

  const proof = await proveHsmeSanaConditioningParityEvidenceV1(plan, evidence, hashPort);
  if (evidence.outcome === 'EXACT_PARITY_PASS') {
    assert.equal(proof.exactParityAccepted, true);
  } else {
    assert.equal(proof.exactParityAccepted, false);
  }

  fs.writeFileSync(outputPath, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  console.log('HSME_SANA_PARITY_VALIDATED=' + evidence.outcome);
  console.log('HSME_SANA_PARITY_PLAN_DIGEST=' + expectedPlanDigest);
} else {
  throw new Error('mode must be phase0, check-phase0-plan, or parity');
}
