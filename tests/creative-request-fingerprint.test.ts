import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  creativeExecutionRunIdempotencyKey,
  creativeRequestFingerprint,
  type CreativeArtifactReplayIdentities,
  type CreativeEditCommand,
} from '../server/core/application/creativeExecutionService.ts';
import { SignedArtifactAuthority } from '../server/core/artifacts/signedArtifactAuthority.ts';

const base: CreativeEditCommand = Object.freeze({
  projectId: 'project-a',
  instruction: 'preserve the garment and make it blue',
  selectedObjectIds: Object.freeze(['object-a', 'object-b']),
  inputArtifactId: 'artifact-original',
  maskArtifactIds: Object.freeze(['mask-a', 'mask-b']),
  preserveMode: 'STRICT',
  clientRequestId: 'request-a',
});

function rawIdentities(command: CreativeEditCommand): CreativeArtifactReplayIdentities {
  return Object.freeze({
    inputArtifactIdentity: command.inputArtifactId,
    maskArtifactIdentities: Object.freeze([...(command.maskArtifactIds ?? [])]),
  });
}

function fingerprint(command: CreativeEditCommand): string {
  return creativeRequestFingerprint(command, rawIdentities(command));
}

test('Creative semantic fingerprint is deterministic across object insertion order and canonical optional defaults', () => {
  const reordered = Object.freeze({
    clientRequestId: base.clientRequestId,
    preserveMode: base.preserveMode,
    maskArtifactIds: base.maskArtifactIds,
    inputArtifactId: base.inputArtifactId,
    selectedObjectIds: base.selectedObjectIds,
    instruction: base.instruction,
    projectId: base.projectId,
  });
  assert.equal(fingerprint(reordered), fingerprint(base));

  const implicitDefaults: CreativeEditCommand = Object.freeze({
    projectId: 'project-defaults',
    instruction: 'global edit',
    inputArtifactId: 'artifact-defaults',
    clientRequestId: 'request-defaults',
  });
  const explicitDefaults: CreativeEditCommand = Object.freeze({
    ...implicitDefaults,
    selectedObjectIds: Object.freeze([]),
    maskArtifactIds: Object.freeze([]),
    preserveMode: 'STRICT',
  });
  assert.equal(fingerprint(implicitDefaults), fingerprint(explicitDefaults));
});

test('every semantic Creative request field participates in the fingerprint without collapsing ordered arrays', () => {
  const accepted = fingerprint(base);
  const variants: CreativeEditCommand[] = [
    { ...base, instruction: 'preserve the garment and make it red' },
    { ...base, inputArtifactId: 'artifact-other' },
    { ...base, maskArtifactIds: ['mask-a', 'mask-c'] },
    { ...base, maskArtifactIds: ['mask-b', 'mask-a'] },
    { ...base, selectedObjectIds: ['object-a', 'object-c'] },
    { ...base, selectedObjectIds: ['object-b', 'object-a'] },
    { ...base, preserveMode: 'RELAXED' },
  ];
  for (const variant of variants) assert.notEqual(fingerprint(variant), accepted);
});

test('fresh clientRequestId keeps the semantic fingerprint but produces a distinct durable run idempotency identity', () => {
  const nextOperation: CreativeEditCommand = Object.freeze({ ...base, clientRequestId: 'request-b' });
  const acceptedFingerprint = fingerprint(base);
  const nextFingerprint = fingerprint(nextOperation);
  assert.equal(nextFingerprint, acceptedFingerprint);
  assert.notEqual(
    creativeExecutionRunIdempotencyKey(nextOperation, nextFingerprint),
    creativeExecutionRunIdempotencyKey(base, acceptedFingerprint),
  );
  assert.match(creativeExecutionRunIdempotencyKey(base, acceptedFingerprint), /^creative-request-v1:[0-9a-f]{64}$/);
});

test('signature-verified replay identity ignores capability expiry/HMAC remint but preserves the canonical artifact resource', () => {
  const secret = 'creative-replay-fingerprint-secret';
  const scope = Object.freeze({ tenantId: 'tenant-replay', userId: 'user-replay', projectId: 'project-replay' });
  const authority = new SignedArtifactAuthority(secret, Object.freeze(['assets.example.test']), () => 2_000);
  const signExternal = (exp: number, id = 'artifact-replay', url = 'https://assets.example.test/input.png') => {
    const payload = Buffer.from(JSON.stringify({ id, url, ...scope, exp })).toString('base64url');
    return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
  };

  const first = signExternal(3_000);
  const reminted = signExternal(4_000);
  const expired = signExternal(1_000);
  assert.notEqual(first, reminted, 'capability envelopes must actually differ for this proof');

  const stableIdentity = authority.resolveReplayIdentity(first, scope);
  assert.equal(authority.resolveReplayIdentity(reminted, scope), stableIdentity);
  assert.equal(authority.resolveReplayIdentity(expired, scope), stableIdentity, 'historical exact replay classification must not depend on token TTL');
  assert.throws(() => authority.resolve(expired, scope), 'new execution authority must still reject an expired capability');
  assert.notEqual(authority.resolveReplayIdentity(signExternal(4_000, 'artifact-other'), scope), stableIdentity);
  assert.throws(() => authority.resolveReplayIdentity(first, { ...scope, userId: 'other-user' }));

  const firstCommand: CreativeEditCommand = Object.freeze({ ...base, projectId: scope.projectId, inputArtifactId: first });
  const remintedCommand: CreativeEditCommand = Object.freeze({ ...firstCommand, inputArtifactId: reminted });
  const replayIdentities = Object.freeze({ inputArtifactIdentity: stableIdentity, maskArtifactIdentities: Object.freeze(['mask-a', 'mask-b']) });
  assert.equal(
    creativeRequestFingerprint(firstCommand, replayIdentities),
    creativeRequestFingerprint(remintedCommand, replayIdentities),
    'reminting the same signed artifact must remain one semantic Creative request',
  );
});
