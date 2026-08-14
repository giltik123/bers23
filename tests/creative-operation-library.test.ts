import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import {
  CapabilityMatcher,
  CreativeOperationLibrary,
  CreativeOperationRegistry,
  OperationCompatibilityEngine,
  OperationDebugger,
  OperationExecutionPlanner,
  OperationExplainability,
  OperationOptimizer,
  OperationParameterValidator,
  OperationPolicyResolver,
  OPERATION_FAMILIES,
  canonicalOperationDescriptors,
  immutableOperationClone,
  type ArtifactMetadata,
  type OperationCapability,
  type OperationDescriptor,
  type OperationScope,
} from '../src/platform/creative/operations/index.ts';

const scope: OperationScope = { tenantId: 'tenant-a', projectId: 'project-a', userId: 'user-a' };
const image = (overrides: Partial<ArtifactMetadata> = {}): ArtifactMetadata => ({
  format: 'PNG',
  width: 1_024,
  height: 1_024,
  bitDepth: 8,
  alpha: true,
  layers: 1,
  ...overrides,
});
const allCapabilities: readonly OperationCapability[] = ['SEGMENTATION', 'GENERATION', 'MASKING', 'UPSCALE', 'STYLE', 'LOCAL', 'GPU', 'AI'];
const environments = { localAvailable: () => true, cloudAvailable: () => true };
const library = () => new CreativeOperationLibrary({ capabilities: { available: () => allCapabilities }, environments });
const registry = new CreativeOperationRegistry();

function parametersFor(descriptor: OperationDescriptor, variant = 1): Record<string, unknown> {
  const parameters: Record<string, unknown> = {};
  for (const [name, rule] of Object.entries(descriptor.parameters)) {
    if (!rule.required) continue;
    if (rule.values) parameters[name] = rule.values[(variant - 1) % rule.values.length];
    else if (rule.type === 'number') parameters[name] = Math.ceil(rule.minimum ?? variant);
    else if (rule.type === 'boolean') parameters[name] = true;
    else parameters[name] = `value-${variant}`;
  }
  return parameters;
}

const categories = [
  'registry',
  'descriptors',
  'capabilities',
  'compatibility',
  'validation',
  'resources',
  'policies',
  'optimization',
  'families',
  'safety',
  'explainability',
  'snapshot',
  'debugger',
  'immutability',
  'injection',
  'isolation',
  'execution',
] as const;

// 17 feature areas × 9 independent descriptor variants = 153 deterministic cases.
for (const category of categories) {
  for (let variant = 1; variant <= 9; variant += 1) {
    const descriptor = canonicalOperationDescriptors[variant - 1];
    test(`${category}: ${descriptor.operationId} case ${variant}`, () => {
      if (category === 'registry') {
        assert.deepEqual(registry.get(descriptor.operationId), descriptor);
        assert.equal(registry.has(descriptor.operationId), true);
      }

      if (category === 'descriptors') {
        assert.ok(descriptor.operationId);
        assert.match(descriptor.version, /^\d+\.\d+\.\d+$/);
        assert.ok(descriptor.inputArtifacts.length + descriptor.outputArtifacts.length > 0);
      }

      if (category === 'capabilities') {
        const matcher = new CapabilityMatcher();
        assert.equal(matcher.match(descriptor, allCapabilities).matched, true);
        const absent = matcher.match(descriptor, []);
        assert.equal(absent.missing.length, descriptor.requiredCapabilities.length);
      }

      if (category === 'compatibility') {
        const engine = new OperationCompatibilityEngine();
        const artifacts = descriptor.inputArtifacts.map(() => image());
        assert.equal(engine.check(descriptor, artifacts).compatible, true);
        if (artifacts.length) assert.equal(engine.check(descriptor, [image({ width: 20_000 })]).compatible, false);
      }

      if (category === 'validation') {
        const validator = new OperationParameterValidator();
        assert.equal(validator.validate(descriptor, parametersFor(descriptor, variant)).valid, true);
        assert.equal(validator.validate(descriptor, { unsupported: true }).valid, descriptor.parameters.unsupported !== undefined);
      }

      if (category === 'resources') {
        assert.ok(descriptor.resources.cpu >= 0);
        assert.ok(descriptor.resources.ramMb >= 0);
        assert.ok(descriptor.resources.expectedQualityGain >= 0 && descriptor.resources.expectedQualityGain <= 1);
      }

      if (category === 'policies') {
        const decision = new OperationPolicyResolver(environments).resolve(descriptor, scope);
        assert.equal(decision.selected, true);
        assert.notEqual(decision.route, 'NONE');
      }

      if (category === 'optimization') {
        const optimizer = new OperationOptimizer();
        const resize = registry.get('resize')!;
        const upscale = registry.get('upscale')!;
        assert.deepEqual(optimizer.optimize([resize, upscale]).map((item) => item.operationId), ['upscale', 'resize']);
        assert.equal(optimizer.analyze([resize, upscale])[0].applied, true);
      }

      if (category === 'families') {
        assert.equal(OPERATION_FAMILIES.includes(descriptor.category), true);
        assert.ok(registry.byFamily(descriptor.category).some((item) => item.operationId === descriptor.operationId));
      }

      if (category === 'safety') {
        assert.equal(typeof descriptor.safety.destructive, 'boolean');
        assert.equal(typeof descriptor.safety.producesAIContent, 'boolean');
        assert.equal(descriptor.safety.requiresVerification, true);
      }

      if (category === 'explainability') {
        const snapshot = library().evaluate({ operationId: descriptor.operationId, parameters: parametersFor(descriptor), artifacts: descriptor.inputArtifacts.map(() => image()), scope });
        const explanation = new OperationExplainability().explain(snapshot);
        assert.equal(explanation.selected, true);
        assert.ok(explanation.reasons.length >= 5);
      }

      if (category === 'snapshot') {
        const snapshot = library().evaluate({ operationId: descriptor.operationId, parameters: parametersFor(descriptor), artifacts: descriptor.inputArtifacts.map(() => image()), scope });
        assert.equal(snapshot.descriptor.operationId, descriptor.operationId);
        assert.deepEqual(snapshot.scope, scope);
        assert.equal(Object.isFrozen(snapshot), true);
      }

      if (category === 'debugger') {
        const snapshot = library().evaluate({ operationId: descriptor.operationId, parameters: parametersFor(descriptor), artifacts: descriptor.inputArtifacts.map(() => image()), scope });
        const debug = new OperationDebugger().inspect(snapshot);
        assert.equal(debug.operation, descriptor.operationId);
        assert.equal(debug.decision.selected, true);
      }

      if (category === 'immutability') {
        assert.equal(Object.isFrozen(descriptor), true);
        assert.equal(Object.isFrozen(descriptor.resources), true);
        assert.equal(Object.isFrozen(descriptor.requiredCapabilities), true);
      }

      if (category === 'injection') {
        let requestedScope: OperationScope | undefined;
        const injected = new CreativeOperationLibrary({
          capabilities: { available(value) { requestedScope = value; return allCapabilities; } },
          environments,
        });
        injected.evaluate({ operationId: descriptor.operationId, parameters: parametersFor(descriptor), artifacts: descriptor.inputArtifacts.map(() => image()), scope });
        assert.equal(requestedScope, scope);
      }

      if (category === 'isolation') {
        const isolated = new CreativeOperationRegistry();
        const custom = immutableOperationClone({ ...descriptor, operationId: `custom-${variant}` }) as OperationDescriptor;
        isolated.register(custom, scope);
        const foreign = { ...scope, userId: `foreign-${variant}` };
        assert.equal(isolated.has(custom.operationId, scope), true);
        assert.equal(isolated.has(custom.operationId, foreign), false);
      }

      if (category === 'execution') {
        const snapshot = library().evaluate({ operationId: descriptor.operationId, parameters: parametersFor(descriptor), artifacts: descriptor.inputArtifacts.map(() => image()), scope });
        const plan = new OperationExecutionPlanner().plan(descriptor, snapshot.decision, scope);
        assert.equal(plan.operationId, descriptor.operationId);
        assert.equal(plan.route, snapshot.decision.route);
      }
    });
  }
}

test('canonical registry includes every required Sprint 6.20 operation', () => {
  const required = ['remove-background', 'resize', 'rotate', 'crop', 'relight', 'segment', 'upscale', 'outpaint', 'inpaint', 'try-on', 'generate', 'replace-object', 'change-color', 'erase-object', 'face-restore', 'style-transfer'];
  assert.deepEqual(required.filter((operationId) => !registry.has(operationId)), []);
});

test('validation, compatibility, capabilities and environment fail closed', () => {
  const noCapabilities = new CreativeOperationLibrary({ capabilities: { available: () => [] }, environments });
  const missingCapability = noCapabilities.evaluate({ operationId: 'upscale', parameters: { factor: 2, quality: 'high' }, artifacts: [image()], scope });
  assert.equal(missingCapability.decision.selected, false);
  assert.match(missingCapability.decision.reason, /Missing capabilities/);

  const invalid = library().evaluate({ operationId: 'resize', parameters: { width: 0, height: 10, mode: 'unknown' }, artifacts: [image()], scope });
  assert.equal(invalid.validation.valid, false);
  assert.equal(invalid.decision.route, 'NONE');

  const offline = new OperationPolicyResolver({ localAvailable: () => false, cloudAvailable: () => false }).resolve(registry.get('generate')!, scope);
  assert.equal(offline.selected, false);
});

test('tone adjustments are fused into one operation', () => {
  const tone = registry.get('adjust-tone')!;
  const optimizer = new OperationOptimizer();
  assert.equal(optimizer.optimize([tone, tone]).length, 1);
  assert.equal(optimizer.analyze([tone, tone])[0].ruleId, 'merge-tone-adjustments');
});

test('unknown operations and incomplete scopes are rejected', () => {
  assert.throws(() => library().evaluate({ operationId: 'missing', parameters: {}, artifacts: [], scope }), /Unknown operation/);
  assert.throws(() => new CreativeOperationRegistry().list({ ...scope, projectId: '' }), /required/);
});

test('operation layer has no forbidden infrastructure imports', async () => {
  const forbidden = ['fal.ai', "from 'reve", 'react', 'billing', 'database', 'node:fs', 'node:http', 'fetch(', 'axios', '/runtime/internal'];
  for (const file of await collectOperationFiles('src/platform/creative/operations')) {
    const source = (await readFile(file, 'utf8')).toLowerCase();
    for (const marker of forbidden) assert.equal(source.includes(marker), false, `${file} contains ${marker}`);
  }
});

async function collectOperationFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectOperationFiles(path) : Promise.resolve(path.endsWith('.ts') ? [path] : []);
  }));
  return nested.flat();
}
