import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import {
  hsmeSanaConditioningGenerationV1Digest,
  hsmeSanaConditioningParityPlanV1Digest,
  proveHsmeSanaConditioningParityEvidenceV1,
} from '../src/platform/creative/local-ai/hsme/HsmeSanaConditioningParityEvidenceV1.ts';

const [planPath, evidencePath, outputPath] = process.argv.slice(2);
if (!planPath || !evidencePath || !outputPath) {
  throw new Error('usage: finalize-hsme-sana-parity-evidence.mjs <plan.json> <candidate-evidence.json> <validated-evidence.json>');
}

const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
const hashPort = {
  sha256: async bytes => createHash('sha256').update(bytes).digest('hex'),
};

const [expectedPlanDigest, expectedGenerationDigest] = await Promise.all([
  hsmeSanaConditioningParityPlanV1Digest(plan, hashPort),
  hsmeSanaConditioningGenerationV1Digest(plan, hashPort),
]);

assert.equal(evidence.planDigest, expectedPlanDigest);
assert.equal(evidence.generationConfigSha256, expectedGenerationDigest);
assert.equal(evidence.phase0EnvelopeDigest, plan.phase0EnvelopeDigest);
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
