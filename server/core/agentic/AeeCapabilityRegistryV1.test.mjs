import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AEE_CAPABILITY_ORTHOGONAL_TRANSFORM_V1,
  AEE_CAPABILITY_REGISTRY_V1,
  AEE_CAPABILITY_RESIZE_V1,
  AeeCapabilityRegistryV1Error,
  buildAeeCapabilityRegistryV1,
  findAeeCapabilityDescriptorV1,
  listAeeCapabilityDescriptorsV1,
  listAeeCapabilityRegistrationsV1,
  requireAeeCapabilityDescriptorV1,
  requireAeeCapabilityRegistrationV1,
} from './AeeCapabilityRegistryV1.ts';
import {
  CROP_TOOL_DEFINITION,
  ORTHOGONAL_TRANSFORM_TOOL_DEFINITION,
  RESIZE_TOOL_DEFINITION,
} from '../../../src/platform/creative/deterministic/DeterministicToolRegistry.ts';

function registrations() {
  return structuredClone(listAeeCapabilityRegistrationsV1());
}

test('AE-2 registry exposes only the bounded accepted Agent surface in deterministic order', () => {
  const descriptors = listAeeCapabilityDescriptorsV1();
  assert.deepEqual(descriptors.map(item => item.capabilityId), [
    AEE_CAPABILITY_ORTHOGONAL_TRANSFORM_V1,
    AEE_CAPABILITY_RESIZE_V1,
  ]);
  assert.match(AEE_CAPABILITY_REGISTRY_V1.digest, /^[0-9a-f]{64}$/u);
  assert.equal(Object.isFrozen(AEE_CAPABILITY_REGISTRY_V1), true);
  assert.equal(Object.isFrozen(descriptors), true);
  assert.equal(Object.isFrozen(descriptors[0]), true);

  const serialized = JSON.stringify(descriptors);
  assert.doesNotMatch(serialized, /providerId|modelId|runtime|executorId|toolId|creditsWallet|billing/iu);
  assert.match(serialized, /CANDIDATE_ARTIFACT_ONLY/u);
});

test('semantic descriptors stay provider-independent while server-internal deterministic bindings resolve accepted tools', () => {
  const orthogonal = requireAeeCapabilityRegistrationV1(AEE_CAPABILITY_ORTHOGONAL_TRANSFORM_V1);
  const resize = requireAeeCapabilityRegistrationV1(AEE_CAPABILITY_RESIZE_V1);

  assert.equal(orthogonal.descriptor.semanticOperation, 'ORTHOGONAL_TRANSFORM');
  assert.equal(orthogonal.binding.toolCapability, ORTHOGONAL_TRANSFORM_TOOL_DEFINITION.capability);
  assert.deepEqual([...orthogonal.descriptor.inputs[0].artifactRoles].sort(), ['COMPOSITE', 'ORIGINAL']);
  assert.equal(orthogonal.descriptor.outputArtifactRole, ORTHOGONAL_TRANSFORM_TOOL_DEFINITION.output.role);
  assert.deepEqual(orthogonal.descriptor.executionEligibility, { deterministic: true, local: true, cloud: false, hybrid: false });

  assert.equal(resize.descriptor.semanticOperation, 'RESIZE');
  assert.equal(resize.binding.toolCapability, RESIZE_TOOL_DEFINITION.capability);
  assert.deepEqual([...resize.descriptor.inputs[0].artifactRoles].sort(), ['COMPOSITE', 'ORIGINAL']);
  assert.equal(resize.descriptor.outputArtifactRole, RESIZE_TOOL_DEFINITION.output.role);
});

test('unknown capability/version fails closed', () => {
  assert.equal(findAeeCapabilityDescriptorV1('bers:capability:unknown:v1'), undefined);
  assert.equal(findAeeCapabilityDescriptorV1(AEE_CAPABILITY_RESIZE_V1, 2), undefined);
  assert.throws(
    () => requireAeeCapabilityDescriptorV1('bers:capability:unknown:v1'),
    (error) => error instanceof AeeCapabilityRegistryV1Error && error.code === 'aee_capability_not_registered',
  );
  assert.throws(
    () => requireAeeCapabilityDescriptorV1(AEE_CAPABILITY_RESIZE_V1, 2),
    (error) => error instanceof AeeCapabilityRegistryV1Error && error.code === 'aee_capability_not_registered',
  );
});

test('registry digest is deterministic across registration ordering', () => {
  const forward = buildAeeCapabilityRegistryV1(registrations());
  const reverse = buildAeeCapabilityRegistryV1(registrations().reverse());
  assert.equal(forward.digest, reverse.digest);
  assert.deepEqual(forward.descriptors, reverse.descriptors);
});

test('V1 builder cannot widen the accepted Agent surface or omit a required capability', () => {
  assert.throws(
    () => buildAeeCapabilityRegistryV1([registrations()[0]]),
    (error) => error instanceof AeeCapabilityRegistryV1Error && error.code === 'aee_capability_v1_surface_size_invalid',
  );

  const widened = registrations();
  widened[0].descriptor.capabilityId = 'bers:capability:crop:v1';
  widened[0].descriptor.semanticOperation = CROP_TOOL_DEFINITION.operation.type;
  widened[0].descriptor.inputs = structuredClone(CROP_TOOL_DEFINITION.inputs.map(input => ({ name: input.name, artifactRoles: input.roles })));
  widened[0].descriptor.outputArtifactRole = CROP_TOOL_DEFINITION.output.role;
  widened[0].binding.toolCapability = CROP_TOOL_DEFINITION.capability;
  assert.throws(
    () => buildAeeCapabilityRegistryV1(widened),
    (error) => error instanceof AeeCapabilityRegistryV1Error && error.code === 'aee_capability_v1_surface_unsupported',
  );
});

test('V1 builder cannot weaken accepted descriptor metadata for the same semantic IDs', () => {
  for (const mutation of [
    (value) => { value.descriptor.capabilityVersion = 2; },
    (value) => { value.descriptor.preconditions = value.descriptor.preconditions.slice(1); },
    (value) => { value.descriptor.evaluatorHooks = value.descriptor.evaluatorHooks.slice(1); },
  ]) {
    const changed = registrations();
    mutation(changed[0]);
    assert.throws(
      () => buildAeeCapabilityRegistryV1(changed),
      (error) => error instanceof AeeCapabilityRegistryV1Error && error.code === 'aee_capability_v1_descriptor_mismatch',
    );
  }
});

test('descriptor schema cannot smuggle provider/model/execution fields', () => {
  for (const key of ['providerId', 'modelId', 'runtime', 'executionId', 'artifactId', 'billing', 'credits']) {
    const injected = registrations();
    injected[0].descriptor[key] = 'forbidden';
    assert.throws(
      () => buildAeeCapabilityRegistryV1(injected),
      (error) => error instanceof AeeCapabilityRegistryV1Error && error.code === 'aee_capability_exact_schema_violation',
    );
  }
});

test('realization semantics cannot be encoded into AEE semantic capability IDs', () => {
  for (const capabilityId of [
    'bers:capability:local-resize:v1',
    'bers:capability:cloud-resize:v1',
    'bers:capability:model-resize:v1',
    'bers:capability:runtime-resize:v1',
  ]) {
    const changed = registrations();
    changed[0].descriptor.capabilityId = capabilityId;
    assert.throws(
      () => buildAeeCapabilityRegistryV1(changed),
      (error) => error instanceof AeeCapabilityRegistryV1Error && error.code === 'aee_capability_id_realization_forbidden',
    );
  }
});

test('duplicate semantic IDs and deterministic bindings fail closed', () => {
  const duplicateId = registrations();
  duplicateId[1].descriptor.capabilityId = duplicateId[0].descriptor.capabilityId;
  assert.throws(
    () => buildAeeCapabilityRegistryV1(duplicateId),
    (error) => error instanceof AeeCapabilityRegistryV1Error && error.code === 'aee_capability_duplicate_id',
  );

  const duplicateBinding = registrations();
  duplicateBinding[1].binding.toolCapability = duplicateBinding[0].binding.toolCapability;
  assert.throws(
    () => buildAeeCapabilityRegistryV1(duplicateBinding),
    (error) => error instanceof AeeCapabilityRegistryV1Error && error.code === 'aee_capability_duplicate_binding',
  );
});

test('exact semantic ID to deterministic binding map cannot be substituted', () => {
  const swapped = registrations();
  swapped[0].binding.toolCapability = RESIZE_TOOL_DEFINITION.capability;
  swapped[1].binding.toolCapability = ORTHOGONAL_TRANSFORM_TOOL_DEFINITION.capability;
  assert.throws(
    () => buildAeeCapabilityRegistryV1(swapped),
    (error) => error instanceof AeeCapabilityRegistryV1Error && error.code === 'aee_capability_v1_binding_mismatch',
  );
});

test('deterministic operation/input/output drift is rejected instead of becoming planner truth', () => {
  const wrongOperation = registrations();
  wrongOperation[0].descriptor.semanticOperation = 'RESIZE';
  assert.throws(
    () => buildAeeCapabilityRegistryV1(wrongOperation),
    (error) => error instanceof AeeCapabilityRegistryV1Error && error.code === 'aee_capability_operation_binding_mismatch',
  );

  const wrongInput = registrations();
  wrongInput[0].descriptor.inputs[0].artifactRoles = ['ORIGINAL'];
  assert.throws(
    () => buildAeeCapabilityRegistryV1(wrongInput),
    (error) => error instanceof AeeCapabilityRegistryV1Error && error.code === 'aee_capability_input_binding_mismatch',
  );

  const wrongOutput = registrations();
  wrongOutput[0].descriptor.outputArtifactRole = 'PREVIEW';
  assert.throws(
    () => buildAeeCapabilityRegistryV1(wrongOutput),
    (error) => error instanceof AeeCapabilityRegistryV1Error && error.code === 'aee_capability_output_binding_mismatch',
  );
});

test('AE-2 V1 refuses accidental capability widening beyond deterministic local-only semantics', () => {
  for (const mutation of [
    (value) => { value.descriptor.executionEligibility.deterministic = false; },
    (value) => { value.descriptor.executionEligibility.local = false; },
    (value) => { value.descriptor.executionEligibility.cloud = true; },
    (value) => { value.descriptor.executionEligibility.hybrid = true; },
  ]) {
    const changed = registrations();
    mutation(changed[0]);
    assert.throws(
      () => buildAeeCapabilityRegistryV1(changed),
      (error) => error instanceof AeeCapabilityRegistryV1Error && error.code === 'aee_capability_v1_eligibility_invalid',
    );
  }
});
