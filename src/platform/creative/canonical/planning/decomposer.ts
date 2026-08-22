import type { CreativeOperation, CreativeRequest } from '../contracts';
import { deepFreeze } from './immutable';

export function isCompositePlanningRequest(request: CreativeRequest): boolean {
  if (request.metadata?.planningMode === 'COMPOSITE_EDIT') return true;
  const text = request.intent.toLowerCase();
  return /\b(remove|delete)\b/.test(text) && /\bbackground\b/.test(text) && /\b(relight|lighting|light)\b/.test(text);
}

export function decomposeOperations(request: CreativeRequest): readonly CreativeOperation[] {
  return isCompositePlanningRequest(request) ? compositeOperations(request) : simpleOperations(request);
}

function simpleOperations(request: CreativeRequest): readonly CreativeOperation[] {
  const artifacts = request.inputArtifacts ?? [];
  const selectedObjectIds = request.metadata?.selectedObjectIds as readonly unknown[] | undefined;
  const controlled = request.metadata?.editCapability === 'CONTROLLED_LOCAL_EDIT'
    && artifacts.some(artifact => artifact.role === 'ORIGINAL')
    && artifacts.some(artifact => artifact.role === 'MASK')
    && Boolean(selectedObjectIds?.length);
  const operation: CreativeOperation = {
    id: 'creative-image-edit',
    type: controlled ? 'CONTROLLED_LOCAL_EDIT' : 'image-edit',
    providerId: 'fal',
    requiredArtifacts: Object.freeze(artifacts.map(artifact => artifact.id)),
    produces: Object.freeze(['image']),
    input: controlled ? Object.freeze({
      instruction: request.intent,
      preserveMode: request.metadata?.preserveMode ?? 'STRICT',
      correlationId: request.metadata?.correlationId,
    }) : Object.freeze({
      prompt: request.intent,
      correlationId: request.metadata?.correlationId,
    }),
  };
  return deepFreeze([operation]);
}

function compositeOperations(request: CreativeRequest): readonly CreativeOperation[] {
  const canonicalInputs = Object.freeze((request.inputArtifacts ?? []).map(artifact => artifact.id));
  const prefix = `plan:${request.id}`;
  const segmentMask = `${prefix}:segment-mask`;
  const removedImage = `${prefix}:removed-image`;
  const backgroundImage = `${prefix}:background-image`;
  const relitImage = `${prefix}:relit-image`;
  const verifiedImage = `${prefix}:verified-image`;
  return deepFreeze([
    { id: 'plan-segment', type: 'segment', providerId: 'fal', requiredArtifacts: canonicalInputs, produces: [segmentMask], input: { instruction: request.intent } },
    { id: 'plan-remove', type: 'remove-object', providerId: 'fal', dependencies: ['plan-segment'], requiredArtifacts: [...canonicalInputs, segmentMask], produces: [removedImage], input: { instruction: request.intent } },
    { id: 'plan-background-replace', type: 'background-replace', providerId: 'fal', dependencies: ['plan-remove'], requiredArtifacts: [removedImage], produces: [backgroundImage], input: { instruction: request.intent } },
    { id: 'plan-relight', type: 'relight', providerId: 'fal', dependencies: ['plan-background-replace'], requiredArtifacts: [backgroundImage], produces: [relitImage], input: { instruction: request.intent } },
    { id: 'plan-verify', type: 'verify-image', providerId: 'fal', dependencies: ['plan-relight'], requiredArtifacts: [relitImage], produces: [verifiedImage], input: { verificationPolicy: 'preserve-requested-constraints' } },
  ] satisfies CreativeOperation[]);
}
