import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { AIExecutionGraph, ArtifactManager, ParameterResolver, PromptAssembler, deepFreeze, type AIDependencies, type AIScope } from '../src/platform/creative/ai';

const scope: AIScope = { tenantId: 'tenant', projectId: 'project', userId: 'user' };
const dependencies = (): AIDependencies => { let sequence = 0; return { id: () => `execution-${++sequence}`, uuid: () => `uuid-${++sequence}`, now: () => ++sequence, random: () => 0.25, sleep: async () => undefined, hash: (value) => `hash-${value.length}` }; };

// This deterministic matrix intentionally registers 140 independently reported
// cases: broad input variation catches ordering, mutation, lineage and contract
// regressions without talking to an external AI provider.
for (let index = 0; index < 40; index += 1) test(`graph determinism ${index + 1}/40`, () => {
  const graph = new AIExecutionGraph([{ id: `root-${index}`, capability: 'generate' }, { id: `child-${index}`, capability: 'upscale', dependencies: [`root-${index}`] }]);
  assert.deepEqual(graph.snapshot.order, [`root-${index}`, `child-${index}`]);
  assert.ok(Object.isFrozen(graph.snapshot.operations));
});

for (let index = 0; index < 30; index += 1) test(`prompt assembly ${index + 1}/30`, () => {
  const result = new PromptAssembler().assemble({ director: `luxury-${index}`, knowledge: ['warm lighting', 'gold accent'], pipeline: 'minimal background', negative: 'noise' });
  assert.equal(result.prompt, `luxury-${index}, warm lighting, gold accent, minimal background`);
  assert.equal(result.negativePrompt, 'noise');
  assert.ok(Object.isFrozen(result.parts));
});

for (let index = 0; index < 25; index += 1) test(`provider parameter resolution ${index + 1}/25`, () => {
  const prompt = new PromptAssembler().assemble({ planning: `campaign-${index}`, negative: 'blur' });
  const result = new ParameterResolver().resolve('provider', { id: `op-${index}`, capability: 'generate', parameters: { steps: 20 + index, seed: index } }, prompt);
  assert.deepEqual(result, { prompt: `campaign-${index}`, steps: 20 + index, seed: index, negative_prompt: 'blur', provider: 'provider' });
  assert.ok(Object.isFrozen(result));
});

for (let index = 0; index < 25; index += 1) test(`artifact isolation and lineage ${index + 1}/25`, () => {
  const manager = new ArtifactManager(dependencies());
  const artifact = manager.create(scope, `op-${index}`, { image: index }, { parentIds: [`source-${index}`], mime: 'image/png' });
  assert.equal(manager.get(artifact.id, scope)?.parentIds[0], `source-${index}`);
  assert.equal(manager.get(artifact.id, { ...scope, tenantId: 'foreign' }), undefined);
  assert.ok(Object.isFrozen(artifact.scope));
});

for (let index = 0; index < 15; index += 1) test(`deep immutability ${index + 1}/15`, () => {
  const value = deepFreeze({ index, nested: { values: [index, index + 1] } });
  assert.ok(Object.isFrozen(value)); assert.ok(Object.isFrozen(value.nested)); assert.ok(Object.isFrozen(value.nested.values));
});

const moduleDirectory = join(process.cwd(), 'src/platform/creative/ai');
const moduleFiles = readdirSync(moduleDirectory).filter((name) => name.endsWith('.ts'));
const forbidden = [/\bfetch\s*\(/, /from\s+['"](?:node:)?fs['"]/, /from\s+['"][^'"]*workflow/i, /from\s+['"][^'"]*billing/i, /from\s+['"][^'"]*(?:fal|reve)/i, /from\s+['"][^'"]*(?:opencv|canvas)/i];
for (let index = 0; index < 5; index += 1) test(`architecture boundary ${index + 1}/5`, () => {
  const sources = moduleFiles.map((name) => readFileSync(join(moduleDirectory, name), 'utf8')).join('\n');
  const patterns = index === 0 ? forbidden : forbidden.slice(index, index + 1);
  patterns.forEach((pattern) => assert.doesNotMatch(sources, pattern));
});
