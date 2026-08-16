import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import type { WorkflowExecutionPlan } from '../src/platform/creative/integration';
import {
  CreativeImagePipeline, LocalOperationLibrary, PipelineCache, PipelineDebugger,
  PipelineGraph, PipelineOperationRegistry, PipelineOptimizer, PipelineRecovery,
  PipelineResourcePlanner, PipelineSimulation, PipelineVerification, WorkflowPipelineTranslator,
  type ImageState, type PipelineDependencies, type PipelineOperationNode, type PipelineScope,
} from '../src/platform/creative/pipeline';

const scope: PipelineScope = { tenantId: 'tenant-a', projectId: 'project-a', userId: 'user-a' };
const foreignScope: PipelineScope = { tenantId: 'tenant-b', projectId: 'project-b', userId: 'user-b' };
const dependencies = (): PipelineDependencies => { let id = 0; let now = 1000; return { id: () => `pipeline-${++id}`, now: () => ++now, random: () => 0.5 }; };
const workflow = (): WorkflowExecutionPlan => ({ id: 'workflow-1', scope, executionGraphId: 'execution-1', steps: [{ id: 'step-segment', executionNodeId: 'node-segment', capability: 'image.segmentation', operation: 'pipeline.segment.subject', dependencies: [], parameters: {}, verificationRequired: true, estimatedLatency: 4 }, { id: 'step-light', executionNodeId: 'node-light', capability: 'lighting.adjustment', operation: 'lighting.normalize', dependencies: ['step-segment'], parameters: {}, verificationRequired: true, estimatedLatency: 2 }, { id: 'step-balance', executionNodeId: 'node-balance', capability: 'color.balance', operation: 'color.white_balance', dependencies: ['step-segment'], parameters: {}, verificationRequired: true, estimatedLatency: 2 }, { id: 'step-upscale', executionNodeId: 'node-upscale', capability: 'image.upscale', operation: 'pipeline.upscale.real_esrgan', dependencies: ['step-light', 'step-balance'], parameters: { scale: 2 }, verificationRequired: true, estimatedLatency: 5 }, { id: 'step-export', executionNodeId: 'node-export', capability: 'image.export', operation: 'pipeline.export', dependencies: ['step-upscale'], parameters: { format: 'png' }, verificationRequired: true, estimatedLatency: 1 }], stages: [{ id: 'workflow-stage-1', order: 1, stepIds: ['step-segment'] }, { id: 'workflow-stage-2', order: 2, stepIds: ['step-light', 'step-balance'] }, { id: 'workflow-stage-3', order: 3, stepIds: ['step-upscale'] }, { id: 'workflow-stage-4', order: 4, stepIds: ['step-export'] }], createdAt: 100 });
const initial = (stateScope = scope): ImageState => new LocalOperationLibrary(dependencies()).create(stateScope, { width: 1920, height: 1080, format: 'jpeg', channels: 3, alpha: false, metadata: { source: 'test' }, estimatedQuality: 0.8, estimatedFileSize: 1_000_000 });
const fixture = () => { const pipeline = new CreativeImagePipeline(dependencies()); const image = initial(); const graph = pipeline.build(workflow(), image); return { pipeline, image, graph }; };

test('pipeline requires ID time and random DI', () => assert.throws(() => new CreativeImagePipeline({} as never)));
test('pipeline rejects execution before build', () => assert.throws(() => new CreativeImagePipeline(dependencies()).execute()));
test('pipeline rejects cross-scope initial image', () => assert.throws(() => new CreativeImagePipeline(dependencies()).build(workflow(), initial(foreignScope))));
test('build creates independent pipeline graph', () => assert.equal(fixture().graph.workflowPlanId, 'workflow-1'));
test('build injects graph ID', () => assert.match(fixture().graph.id, /^pipeline-/));
test('build injects graph timestamp', () => assert.ok(fixture().graph.createdAt > 1000));
test('build preserves complete scope', () => assert.deepEqual(fixture().graph.scope, scope));
test('build translates every workflow step', () => assert.equal(fixture().graph.operations.length, 5));
test('build translates every workflow stage', () => assert.equal(fixture().graph.stages.length, 4));
test('build preserves dependencies', () => assert.equal(fixture().graph.dependencies.length, 5));
test('build creates rollback point per operation', () => assert.equal(fixture().graph.rollbackPoints.length, 5));
test('pipeline graph is deeply immutable', () => { const graph = fixture().graph; assert.ok(Object.isFrozen(graph.operations)); assert.ok(Object.isFrozen(graph.scope)); assert.throws(() => (graph.stages as unknown[]).push({})); });

const pipelineNode = (id: string, nodeScope = scope): PipelineOperationNode => ({ id, scope: nodeScope, workflowStepId: `step-${id}`, operation: 'lighting.normalize', implementation: 'color balance', capability: 'local', dependencies: [], resources: { cpu: 1, gpu: 0, ram: 4, latency: 1, credits: 0 }, verificationRequired: true, rollbackPoint: true, stage: 1 });
test('PipelineGraph adds operations', () => { const graph = new PipelineGraph(dependencies()); assert.equal(graph.addOperation(pipelineNode('a')).id, 'a'); });
test('PipelineGraph rejects duplicate operations', () => { const graph = new PipelineGraph(dependencies()); graph.addOperation(pipelineNode('a')); assert.throws(() => graph.addOperation(pipelineNode('a'))); });
test('PipelineGraph rejects broken dependencies', () => { const graph = new PipelineGraph(dependencies()); graph.addOperation(pipelineNode('a')); assert.throws(() => graph.addDependency('a', 'missing', scope)); });
test('PipelineGraph rejects cross-scope dependencies', () => { const graph = new PipelineGraph(dependencies()); graph.addOperation(pipelineNode('a')); graph.addOperation(pipelineNode('b', foreignScope)); assert.throws(() => graph.addDependency('a', 'b', scope)); });
test('PipelineGraph rejects cycles', () => { const graph = new PipelineGraph(dependencies()); graph.addOperation(pipelineNode('a')); graph.addOperation(pipelineNode('b')); graph.addDependency('a', 'b', scope); assert.throws(() => graph.addDependency('b', 'a', scope)); });
test('PipelineGraph rejects self dependencies', () => { const graph = new PipelineGraph(dependencies()); graph.addOperation(pipelineNode('a')); assert.throws(() => graph.addDependency('a', 'a', scope)); });
test('PipelineGraph validates stage references', () => { const graph = new PipelineGraph(dependencies()); graph.addOperation(pipelineNode('a')); assert.throws(() => graph.setStages([{ id: 's', order: 1, operationIds: ['missing'], parallel: false }])); });
test('PipelineGraph snapshot filters scope', () => { const graph = new PipelineGraph(dependencies()); graph.addOperation(pipelineNode('a')); graph.addOperation(pipelineNode('b', foreignScope)); graph.setStages([]); assert.equal(graph.snapshot(scope, 'w').operations.length, 1); });

test('translator maps local capability', () => assert.equal(fixture().graph.operations.find((item) => item.operation === 'lighting.normalize')?.capability, 'local'));
test('translator maps GPU capability', () => assert.equal(fixture().graph.operations.find((item) => item.operation.includes('upscale'))?.capability, 'gpu'));
test('translator maps hybrid capability', () => assert.equal(fixture().graph.operations.find((item) => item.operation.includes('segment'))?.capability, 'hybrid'));
test('translator rejects unsupported workflow operation', () => { const value = workflow(); const unsupported = { ...value, steps: [{ ...value.steps[0], operation: 'unsupported' }] }; assert.throws(() => new WorkflowPipelineTranslator(dependencies(), new PipelineOperationRegistry(dependencies().id)).translate(unsupported)); });
test('translator output is deterministic', () => assert.deepEqual(new WorkflowPipelineTranslator(dependencies(), new PipelineOperationRegistry(dependencies().id)).translate(workflow()), new WorkflowPipelineTranslator(dependencies(), new PipelineOperationRegistry(dependencies().id)).translate(workflow())));

test('registry maps lighting normalize', () => assert.equal(new PipelineOperationRegistry(dependencies().id).resolve('lighting.normalize')?.implementation, 'color balance'));
test('registry maps upscale to GPU', () => assert.equal(new PipelineOperationRegistry(dependencies().id).resolve('pipeline.upscale.real_esrgan')?.capability, 'gpu'));
test('registry maps background removal to AI', () => assert.equal(new PipelineOperationRegistry(dependencies().id).resolve('pipeline.background.remove')?.capability, 'ai'));
test('registry supports aliases', () => assert.equal(new PipelineOperationRegistry(dependencies().id).resolve('upscale')?.workflowOperation, 'pipeline.upscale.real_esrgan'));
test('registry supports versions', () => assert.ok(new PipelineOperationRegistry(dependencies().id).resolve('upscale', '2.0.0')));
test('registry rejects unsupported versions', () => assert.equal(new PipelineOperationRegistry(dependencies().id).resolve('upscale', '9.0.0'), undefined));
test('registry ignores deprecated definitions', () => { const registry = new PipelineOperationRegistry(dependencies().id, []); registry.register({ workflowOperation: 'x', implementation: 'x', capability: 'local', aliases: [], versions: ['1'], deprecated: true, priority: 1, effects: {}, resources: { cpu: 0, gpu: 0, ram: 0, latency: 0, credits: 0 } }); assert.equal(registry.resolve('x'), undefined); });
test('registry supports fallback', () => assert.equal(new PipelineOperationRegistry(dependencies().id).fallback('pipeline.upscale.real_esrgan'), 'resize'));
test('registry honors priority', () => { const deps = dependencies(); const registry = new PipelineOperationRegistry(deps.id, []); const base = { workflowOperation: 'x', capability: 'local' as const, aliases: [], versions: ['1'], deprecated: false, effects: {}, resources: { cpu: 0, gpu: 0, ram: 0, latency: 0, credits: 0 } }; registry.register({ ...base, implementation: 'low', priority: 1 }); registry.register({ ...base, implementation: 'high', priority: 10 }); assert.equal(registry.resolve('x')?.implementation, 'high'); });
test('registry rejects duplicate IDs', () => { const registry = new PipelineOperationRegistry(dependencies().id, []); const base = { id: 'same', workflowOperation: 'a', implementation: 'a', capability: 'local' as const, aliases: [], versions: ['1'], deprecated: false, priority: 1, effects: {}, resources: { cpu: 0, gpu: 0, ram: 0, latency: 0, credits: 0 } }; registry.register(base); assert.throws(() => registry.register({ ...base, workflowOperation: 'b' })); });
test('registry entries are deeply immutable', () => assert.ok(Object.isFrozen(new PipelineOperationRegistry(dependencies().id).all()[0].resources)));

const localNames = ['resize', 'crop', 'rotate', 'flip', 'color balance', 'brightness', 'contrast', 'saturation', 'sharpen', 'blur', 'mask merge', 'layer blend', 'alpha merge', 'jpeg encode', 'png encode', 'webp encode'];
for (const operation of localNames) test(`local operation library supports ${operation}`, () => assert.equal(new LocalOperationLibrary(dependencies()).supports(operation), true));
test('local library rejects unsupported operation', () => assert.throws(() => new LocalOperationLibrary(dependencies()).apply('magic', initial())));
test('local resize creates new state', () => { const deps = dependencies(); const library = new LocalOperationLibrary(deps); const before = library.create(scope, { width: 1920, height: 1080, format: 'jpeg', channels: 3, alpha: false, metadata: {}, estimatedQuality: 0.8, estimatedFileSize: 1_000_000 }); const after = library.apply('resize', before, { width: 100, height: 200 }); assert.equal(after.width, 100); assert.equal(after.height, 200); assert.notEqual(after.id, before.id); });
test('local operation preserves parent causality', () => { const library = new LocalOperationLibrary(dependencies()); const before = initial(); assert.equal(library.apply('crop', before).parentId, before.id); });
test('local operation increments generation', () => { const library = new LocalOperationLibrary(dependencies()); assert.equal(library.apply('rotate', initial()).generation, 2); });
test('JPEG encoding removes alpha', () => { const library = new LocalOperationLibrary(dependencies()); const value = library.apply('jpeg encode', { ...initial(), alpha: true, channels: 4 }); assert.equal(value.alpha, false); assert.equal(value.channels, 3); });
test('PNG encoding changes format', () => assert.equal(new LocalOperationLibrary(dependencies()).apply('png encode', initial()).format, 'png'));
test('WebP encoding reduces size', () => { const before = initial(); assert.ok(new LocalOperationLibrary(dependencies()).apply('webp encode', before).estimatedFileSize < before.estimatedFileSize); });
test('sharpen raises estimated quality', () => { const before = initial(); assert.ok(new LocalOperationLibrary(dependencies()).apply('sharpen', before).estimatedQuality > before.estimatedQuality); });
test('local image states are deeply immutable', () => assert.ok(Object.isFrozen(new LocalOperationLibrary(dependencies()).apply('crop', initial()).metadata)));

test('resource planner calculates CPU', () => assert.ok(new PipelineResourcePlanner().plan(fixture().graph, initial()).cpu > 0));
test('resource planner calculates GPU', () => assert.ok(new PipelineResourcePlanner().plan(fixture().graph, initial()).gpu > 0));
test('resource planner calculates RAM', () => assert.ok(new PipelineResourcePlanner().plan(fixture().graph, initial()).ram > 0));
test('resource planner calculates image pixels', () => assert.equal(new PipelineResourcePlanner().plan(fixture().graph, initial()).imagePixels, 1920 * 1080));
test('resource planner calculates estimated memory', () => assert.ok(new PipelineResourcePlanner().plan(fixture().graph, initial()).estimatedMemory > 0));
test('resource planner calculates parallel latency', () => assert.equal(new PipelineResourcePlanner().plan(fixture().graph, initial()).estimatedLatency, 12));
test('resource planner detects shortages', () => { const result = new PipelineResourcePlanner().plan(fixture().graph, initial(), { gpu: 0 }); assert.equal(result.feasible, false); assert.ok(result.shortages.includes('gpu')); });

test('simulation evolves state after every operation', () => { const { graph } = fixture(); assert.equal(new PipelineSimulation(dependencies()).simulate(graph, initial()).states.length, graph.operations.length + 1); });
test('simulation predicts latency', () => assert.equal(fixture().pipeline.execute().latency, 12));
test('simulation predicts memory', () => assert.ok(fixture().pipeline.execute().memory > 0));
test('simulation predicts credits', () => assert.equal(fixture().pipeline.execute().credits, 0));
test('simulation predicts increased quality', () => assert.ok(fixture().pipeline.execute().expectedQuality > initial().estimatedQuality));
test('simulation predicts final size', () => assert.ok(fixture().pipeline.execute().expectedSize > 0));
test('simulation is deterministic', () => assert.deepEqual(fixture().pipeline.execute(), fixture().pipeline.execute()));
test('simulation is deeply immutable', () => assert.ok(Object.isFrozen(fixture().pipeline.execute().states)));

test('verification checks every operation', () => { const { pipeline, graph } = fixture(); const simulation = pipeline.execute(); assert.equal(new PipelineVerification(pipeline.registry).verify(graph, simulation.states).length, graph.operations.length); });
test('verification detects expected alpha mismatch', () => { const { pipeline, graph } = fixture(); const result = new PipelineVerification(pipeline.registry).verify(graph, [initial()]); assert.ok(result.some((item) => !item.passed)); });
test('verification reports immutable issues', () => { const { pipeline, graph } = fixture(); assert.ok(Object.isFrozen(new PipelineVerification(pipeline.registry).verify(graph, pipeline.execute().states)[0].issues)); });

test('recovery chooses fallback when available', () => { const { pipeline, graph } = fixture(); const upscale = graph.operations.find((item) => item.operation.includes('upscale'))!; assert.equal(new PipelineRecovery(pipeline.registry).plan(graph, upscale.id, 'gpu unavailable').action, 'fallback'); });
test('recovery can skip operation', () => { const { pipeline, graph } = fixture(); assert.equal(new PipelineRecovery(pipeline.registry).plan(graph, graph.operations[0].id, 'optional', 'skip').action, 'skip'); });
test('recovery can replace operation', () => { const { pipeline, graph } = fixture(); assert.equal(new PipelineRecovery(pipeline.registry).plan(graph, graph.operations[0].id, 'replace', 'replace').action, 'replace'); });
test('recovery can abort pipeline', () => { const { pipeline, graph } = fixture(); assert.equal(new PipelineRecovery(pipeline.registry).plan(graph, graph.operations[0].id, 'fatal', 'abort').action, 'abort'); });
test('recovery calculates affected subtree', () => { const { pipeline, graph } = fixture(); const first = graph.operations.find((item) => item.operation.includes('segment'))!; assert.ok(new PipelineRecovery(pipeline.registry).plan(graph, first.id, 'fail').removeOperationIds.length > 1); });
test('recovery rejects missing operation', () => assert.throws(() => new PipelineRecovery(fixture().pipeline.registry).plan(fixture().graph, 'missing', 'fail')));

test('optimizer preserves graph', () => assert.equal(new PipelineOptimizer().optimize(fixture().graph).graph.id, fixture().graph.id));
test('optimizer returns operation order', () => assert.equal(new PipelineOptimizer().optimize(fixture().graph).reorderedOperationIds.length, 5));
test('optimizer returns parallel groups', () => assert.equal(new PipelineOptimizer().optimize(fixture().graph).parallelGroups.length, 4));
test('optimizer estimates temporary buffer savings', () => assert.ok(new PipelineOptimizer().optimize(fixture().graph).bufferSavings >= 0));
test('optimizer result is immutable', () => assert.ok(Object.isFrozen(new PipelineOptimizer().optimize(fixture().graph))));

test('cache stores intermediate state', () => { const cache = new PipelineCache(dependencies()); assert.equal(cache.put(scope, 'op', 'in', 'out', initial()).operationId, 'op'); });
test('cache retrieves by deterministic hash', () => { const cache = new PipelineCache(dependencies()); cache.put(scope, 'op', 'in', 'out', initial()); assert.equal(cache.get(scope, 'op', 'in')?.outputHash, 'out'); });
test('cache replaces matching entry', () => { const cache = new PipelineCache(dependencies()); cache.put(scope, 'op', 'in', 'one', initial()); cache.put(scope, 'op', 'in', 'two', initial()); assert.equal(cache.snapshot(scope).length, 1); });
test('cache lists reuse candidates', () => { const cache = new PipelineCache(dependencies()); cache.put(scope, 'op', 'in', 'out', initial()); assert.equal(cache.reuseCandidates(scope, 'in').length, 1); });
test('cache hash is deterministic', () => { const cache = new PipelineCache(dependencies()); assert.equal(cache.hash(['a', 1, true]), cache.hash(['a', 1, true])); });
test('cache enforces scope on state', () => assert.throws(() => new PipelineCache(dependencies()).put(scope, 'op', 'in', 'out', initial(foreignScope))));
test('cache isolates tenant project user', () => { const cache = new PipelineCache(dependencies()); cache.put(scope, 'op', 'in', 'out', initial()); cache.put(foreignScope, 'op', 'in', 'other', initial(foreignScope)); assert.equal(cache.snapshot(scope).length, 1); });
test('cache snapshot is immutable', () => assert.ok(Object.isFrozen(new PipelineCache(dependencies()).snapshot(scope))));

test('validate accepts translated graph', () => assert.equal(fixture().pipeline.validate().valid, true));
test('estimate exposes resources', () => assert.ok(fixture().pipeline.estimate().estimatedMemory > 0));
test('inspect exposes capability and implementation', () => { const inspection = fixture().pipeline.inspect(); assert.ok(inspection[0].capability && inspection[0].implementation); });
test('snapshot includes all required sections', () => { const value = fixture().pipeline.snapshot(); assert.ok(value.graph && value.resources && value.simulation && value.verification && value.recovery && value.metrics && value.timeline && value.imageStates); });
test('snapshot contains metrics', () => assert.equal(fixture().pipeline.snapshot().metrics.operationCount, 5));
test('snapshot is deeply immutable', () => { const value = fixture().pipeline.snapshot(); assert.ok(Object.isFrozen(value.scope)); assert.throws(() => (value.imageStates as unknown[]).push({})); });
test('debugger follows workflow to snapshot chain', () => { const value = fixture().pipeline.debug(); assert.ok(value.workflowId && value.pipelineId && value.operations && value.resources && value.metrics && value.snapshotId); });
test('standalone debugger accepts snapshot', () => { const { pipeline } = fixture(); const snapshot = pipeline.snapshot(); assert.equal(new PipelineDebugger().debug(snapshot).snapshotId, snapshot.id); });
test('replay reproduces simulation', () => { const { pipeline } = fixture(); const snapshot = pipeline.snapshot(); const replayed = pipeline.replay(snapshot, scope).finalState; assert.deepEqual({ width: replayed.width, height: replayed.height, format: replayed.format, quality: replayed.estimatedQuality, size: replayed.estimatedFileSize, generation: replayed.generation }, { width: snapshot.simulation.finalState.width, height: snapshot.simulation.finalState.height, format: snapshot.simulation.finalState.format, quality: snapshot.simulation.finalState.estimatedQuality, size: snapshot.simulation.finalState.estimatedFileSize, generation: snapshot.simulation.finalState.generation }); });
test('replay rejects foreign scope', () => { const { pipeline } = fixture(); assert.throws(() => pipeline.replay(pipeline.snapshot(), foreignScope)); });
test('all IDs and timestamps originate from DI', () => { const { pipeline, graph } = fixture(); assert.match(graph.id, /^pipeline-/); assert.ok(pipeline.snapshot().createdAt > 1000); });
test('randomness is injected but deterministic heuristics do not consume it', () => { let calls = 0; const deps = { ...dependencies(), random: () => { calls += 1; return 0.1; } }; const pipeline = new CreativeImagePipeline(deps); pipeline.build(workflow(), new LocalOperationLibrary(deps).create(scope, { width: 1, height: 1, format: 'png', channels: 4, alpha: true, metadata: {}, estimatedQuality: 1, estimatedFileSize: 1 })); pipeline.snapshot(); assert.equal(calls, 0); });
test('pipeline imports only public Integration contract', () => { const directory = 'src/platform/creative/pipeline'; const forbidden = ['decision/', 'director/', 'studio/', 'meta/', 'knowledge/', 'planning/', 'execution/', 'workflow/', 'runtime/', 'providers/', 'billing/', 'application/', 'ui/', 'react', 'retired-runtime']; for (const file of readdirSync(directory)) { if (!file.endsWith('.ts')) continue; const imports = readFileSync(`${directory}/${file}`, 'utf8').split('\n').filter((line) => /^import|^export .* from/.test(line)).join('\n').toLowerCase(); for (const term of forbidden) assert.equal(imports.includes(term), false, `${file} imports ${term}`); } });
