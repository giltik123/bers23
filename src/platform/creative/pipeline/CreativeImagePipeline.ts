import type { WorkflowExecutionPlan } from '../integration';
import { LocalOperationLibrary } from './LocalOperationLibrary';
import { PipelineCache } from './PipelineCache';
import { PipelineDebugger } from './PipelineDebugger';
import { PipelineOperationRegistry } from './PipelineOperationRegistry';
import { PipelineOptimizer } from './PipelineOptimizer';
import { PipelineRecovery } from './PipelineRecovery';
import { PipelineResourcePlanner } from './PipelineResourcePlanner';
import { PipelineSimulation } from './PipelineSimulation';
import { PipelineVerification } from './PipelineVerification';
import { WorkflowPipelineTranslator } from './WorkflowPipelineTranslator';
import { pipelineDeepFreeze, samePipelineScope } from './PipelineImmutable';
import type {
  ImageState, PipelineDependencies, PipelineGraphSnapshot, PipelineRecoveryPlan,
  PipelineSnapshot, PipelineTimelineEntry,
} from './ImagePipelineTypes';

/**
 * Public, provider-independent image-pipeline facade.
 * It translates a public WorkflowExecutionPlan and performs deterministic virtual execution only.
 */
export class CreativeImagePipeline {
  readonly registry: PipelineOperationRegistry;
  readonly local: LocalOperationLibrary;
  readonly cache: PipelineCache;
  private readonly translator: WorkflowPipelineTranslator;
  private readonly resources = new PipelineResourcePlanner();
  private readonly simulator: PipelineSimulation;
  private readonly verification: PipelineVerification;
  private readonly recoveryEngine: PipelineRecovery;
  private readonly optimizer = new PipelineOptimizer();
  private readonly debugger = new PipelineDebugger();
  private workflow?: WorkflowExecutionPlan;
  private graph?: PipelineGraphSnapshot;
  private initial?: ImageState;
  private latest?: PipelineSnapshot;
  private recovery: readonly PipelineRecoveryPlan[] = [];
  private timeline: readonly PipelineTimelineEntry[] = [];

  constructor(private readonly dependencies: PipelineDependencies, registry?: PipelineOperationRegistry) {
    if (!dependencies?.id || !dependencies?.now || !dependencies?.random) throw new Error('CreativeImagePipeline requires id, now and random dependencies');
    this.registry = registry ?? new PipelineOperationRegistry(dependencies.id);
    this.local = new LocalOperationLibrary(dependencies);
    this.cache = new PipelineCache(dependencies);
    this.translator = new WorkflowPipelineTranslator(dependencies, this.registry);
    this.simulator = new PipelineSimulation(dependencies);
    this.verification = new PipelineVerification(this.registry);
    this.recoveryEngine = new PipelineRecovery(this.registry);
  }

  /** Builds an immutable PipelineGraph from the public workflow contract. */
  build(workflow: WorkflowExecutionPlan, initial: ImageState): PipelineGraphSnapshot {
    if (!samePipelineScope(workflow.scope, initial.scope)) throw new Error('Scope isolation violation');
    this.workflow = workflow;
    this.initial = initial;
    this.graph = this.translator.translate(workflow);
    this.recovery = pipelineDeepFreeze([]);
    this.timeline = pipelineDeepFreeze([this.event('built', 'Pipeline graph built')]);
    return this.graph;
  }

  /** Virtually executes the graph and returns newly derived immutable ImageState values. */
  execute(graph: PipelineGraphSnapshot = this.requiredGraph(), initial: ImageState = this.requiredInitial()) {
    this.assertScope(graph.scope, initial.scope);
    const simulation = this.simulator.simulate(graph, initial);
    this.timeline = pipelineDeepFreeze([...this.timeline, this.event('simulated', 'Virtual pipeline execution completed')]);
    return simulation;
  }

  /** Validates graph references, scope, operation mappings and acyclicity assumptions. */
  validate(graph: PipelineGraphSnapshot = this.requiredGraph()) {
    const operationIds = new Set(graph.operations.map((item) => item.id));
    const issues = [
      ...graph.dependencies.filter((item) => !operationIds.has(item.source) || !operationIds.has(item.target)).map(() => 'broken dependency'),
      ...graph.operations.filter((item) => !this.registry.resolve(item.operation)).map((item) => `unsupported operation: ${item.operation}`),
      ...graph.stages.filter((stage) => stage.operationIds.some((id) => !operationIds.has(id))).map(() => 'broken stage reference'),
    ];
    return pipelineDeepFreeze({ valid: !issues.length, issues });
  }

  /** Estimates resource demand without processing pixels. */
  estimate(graph: PipelineGraphSnapshot = this.requiredGraph(), initial: ImageState = this.requiredInitial()) { return this.resources.plan(graph, initial); }

  /** Returns operation, capability, dependency and resource information. */
  inspect(graph: PipelineGraphSnapshot = this.requiredGraph()) {
    return pipelineDeepFreeze(graph.operations.map((item) => ({ id: item.id, operation: item.operation, implementation: item.implementation, capability: item.capability, dependencies: graph.dependencies.filter((edge) => edge.target === item.id).map((edge) => edge.source), resources: item.resources })));
  }

  optimize(graph: PipelineGraphSnapshot = this.requiredGraph()) { return this.optimizer.optimize(graph); }

  recover(operationId: string, reason: string, graph: PipelineGraphSnapshot = this.requiredGraph()) {
    const plan = this.recoveryEngine.plan(graph, operationId, reason);
    this.recovery = pipelineDeepFreeze([...this.recovery, plan]);
    this.timeline = pipelineDeepFreeze([...this.timeline, this.event('recovery', reason, operationId)]);
    return plan;
  }

  snapshot(): PipelineSnapshot {
    const graph = this.requiredGraph();
    const initial = this.requiredInitial();
    const workflow = this.requiredWorkflow();
    const simulation = this.simulator.simulate(graph, initial);
    const verification = this.verification.verify(graph, simulation.states);
    const resources = this.resources.plan(graph, initial);
    const metrics = {
      operationCount: graph.operations.length,
      localRatio: graph.operations.filter((item) => item.capability === 'local').length / Math.max(1, graph.operations.length),
      parallelRatio: graph.stages.filter((item) => item.parallel).length / Math.max(1, graph.stages.length),
      cacheReuse: this.cache.snapshot(graph.scope).length,
      verificationPassRate: verification.filter((item) => item.passed).length / Math.max(1, verification.length),
      recoveryCount: this.recovery.length,
    };
    this.latest = pipelineDeepFreeze({ id: this.dependencies.id(), scope: { ...graph.scope }, workflow, graph, resources, simulation, verification, recovery: this.recovery, metrics, timeline: this.timeline, imageStates: simulation.states, createdAt: this.dependencies.now() });
    return this.latest;
  }

  debug(snapshot: PipelineSnapshot = this.latest ?? this.snapshot()) { return this.debugger.debug(snapshot); }

  replay(snapshot: PipelineSnapshot, scope: PipelineSnapshot['scope']) {
    if (!samePipelineScope(snapshot.scope, scope)) throw new Error('Scope isolation violation');
    this.workflow = snapshot.workflow;
    this.graph = snapshot.graph;
    this.initial = snapshot.imageStates[0];
    this.recovery = snapshot.recovery;
    this.timeline = pipelineDeepFreeze([...snapshot.timeline, this.event('replayed', `Replayed snapshot ${snapshot.id}`)]);
    return this.execute(snapshot.graph, snapshot.imageStates[0]);
  }

  private event(type: PipelineTimelineEntry['type'], message: string, operationId?: string): PipelineTimelineEntry {
    return pipelineDeepFreeze({ id: this.dependencies.id(), operationId, type, timestamp: this.dependencies.now(), message });
  }
  private assertScope(left: PipelineSnapshot['scope'], right: PipelineSnapshot['scope']): void { if (!samePipelineScope(left, right)) throw new Error('Scope isolation violation'); }
  private requiredGraph(): PipelineGraphSnapshot { if (!this.graph) throw new Error('Pipeline has not been built'); return this.graph; }
  private requiredInitial(): ImageState { if (!this.initial) throw new Error('Initial image state is missing'); return this.initial; }
  private requiredWorkflow(): WorkflowExecutionPlan { if (!this.workflow) throw new Error('Workflow plan is missing'); return this.workflow; }
}
