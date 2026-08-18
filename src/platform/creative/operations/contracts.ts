export type ExecutionTarget = 'LOCAL' | 'CLOUD' | 'HYBRID' | 'BLOCKED';

export type CreativeOperationIdentity = Readonly<{
  operationId: string;
  operationVersion: string;
  operationFamily: string;
  tenantId: string;
  projectId: string;
  userId: string;
  requestId: string;
}>;

export type ExecutionIntent = Readonly<{
  target: ExecutionTarget;
  requiredCapabilities: readonly string[];
  selectedRuntime?: string;
  selectedProvider?: string;
  selectedModel?: string;
  executionMode: string;
  fallbackPolicy: Readonly<Record<string, unknown>>;
  verificationPolicy: Readonly<Record<string, unknown>>;
}>;

export type CreativeOperationDefinition = Readonly<{
  operationId: string;
  version: string;
  family: string;
  capabilities: readonly string[];
  inputArtifacts: readonly string[];
  outputArtifacts: readonly string[];
  parametersSchema: Readonly<Record<string, unknown>>;
  executionPolicy: Readonly<Record<string, unknown>>;
  verificationPolicy: Readonly<Record<string, unknown>>;
  resourceProfile: Readonly<Record<string, number>>;
  costModel: Readonly<Record<string, unknown>>;
  riskProfile: Readonly<Record<string, unknown>>;
  billable: boolean;
}>;

export type CreativeOperationInstance = Readonly<{
  identity: CreativeOperationIdentity;
  operationId: string;
  operationVersion: string;
  parametersSnapshot: Readonly<Record<string, unknown>>;
  inputArtifacts: readonly string[];
  executionIntent: ExecutionIntent;
  scope: Readonly<{ tenantId: string; projectId: string; userId: string }>;
  createdAt: string;
  idempotencyKey: string;
}>;

export function immutable<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(immutable);
    Object.freeze(value);
  }
  return value;
}

const required = (value: string, field: string) => {
  if (!value?.trim()) throw new Error(`${field} is required`);
};

export function validateIdentity(identity: CreativeOperationIdentity): void {
  Object.entries(identity).forEach(([field, value]) => required(value, field));
}

export function validateDefinition(definition: CreativeOperationDefinition): void {
  required(definition.operationId, 'operationId');
  required(definition.version, 'version');
  required(definition.family, 'family');
  if (!Array.isArray(definition.capabilities)) throw new Error('capabilities are required');
}

export function createOperationInstance(input: Readonly<{
  definition: CreativeOperationDefinition;
  identity: CreativeOperationIdentity;
  parameters: Readonly<Record<string, unknown>>;
  inputArtifacts?: readonly string[];
  executionIntent: ExecutionIntent;
  createdAt: string;
  idempotencyKey: string;
}>): CreativeOperationInstance {
  validateDefinition(input.definition);
  validateIdentity(input.identity);
  if (input.identity.operationId !== input.definition.operationId || input.identity.operationVersion !== input.definition.version) {
    throw new Error('Operation identity does not match definition');
  }
  required(input.idempotencyKey, 'idempotencyKey');
  return immutable({
    identity: { ...input.identity }, operationId: input.identity.operationId,
    operationVersion: input.identity.operationVersion,
    parametersSnapshot: structuredClone(input.parameters),
    inputArtifacts: [...(input.inputArtifacts ?? [])],
    executionIntent: structuredClone(input.executionIntent),
    scope: { tenantId: input.identity.tenantId, projectId: input.identity.projectId, userId: input.identity.userId },
    createdAt: input.createdAt, idempotencyKey: input.idempotencyKey,
  });
}

export function canonicalIdempotencyKey(instance: CreativeOperationInstance): string {
  const { tenantId, projectId, userId, requestId, operationId } = instance.identity;
  return [tenantId, projectId, userId, requestId, operationId, instance.idempotencyKey].join(':');
}
