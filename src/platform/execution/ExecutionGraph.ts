import { freezeExecutionStep, type ExecutionStep } from './ExecutionStep';
import { createExecutionEdge, type ExecutionEdge } from './ExecutionEdge';
import { createExecutionNode, type ExecutionNode } from './ExecutionNode';
import type { ExecutionEdgeCondition, ExecutionNodeType } from './ExecutionTypes';
import { ExecutionGraphCycle } from './ExecutionErrors';

/** Result of validating an execution graph. */
export interface ExecutionGraphValidation { readonly valid: boolean; readonly errors: readonly string[]; }

/** Directed acyclic graph containing provider-neutral execution steps. */
export class ExecutionGraph {
  private readonly steps = new Map<string, ExecutionStep>();
  private readonly nodes = new Map<string, ExecutionNode>();
  private readonly edges: ExecutionEdge[] = [];

  /** Adds a step. IDs must be unique and dependencies may be added later. */
  addStep(step: ExecutionStep): void {
    if (this.steps.has(step.id)) throw new Error(`Execution step "${step.id}" is already registered.`);
    this.steps.set(step.id, freezeExecutionStep(step));
    this.nodes.set(step.id, createExecutionNode(step, inferNodeType(step)));
    for (const dependency of step.dependencies) this.addEdgeInternal(dependency, step.id, 'success');
  }

  /** Adds a fully described graph node. */
  addNode(node: ExecutionNode): void {
    this.addStep(node);
    this.nodes.set(node.id, Object.freeze({ ...node, dependencies: Object.freeze([...node.dependencies]) }));
  }

  /** Makes stepA depend on stepB (stepB executes first). */
  addDependency(stepA: string, stepB: string): void {
    const step = this.steps.get(stepA);
    if (!step) throw new Error(`Execution step "${stepA}" does not exist.`);
    if (!this.steps.has(stepB)) throw new Error(`Execution dependency "${stepB}" does not exist.`);
    if (step.dependencies.includes(stepB)) return;
    this.steps.set(stepA, freezeExecutionStep({ ...step, dependencies: [...step.dependencies, stepB] }));
    const node = this.nodes.get(stepA)!;
    this.nodes.set(stepA, Object.freeze({ ...node, dependencies: Object.freeze([...node.dependencies, stepB]) }));
    this.addEdgeInternal(stepB, stepA, 'success');
  }


  /** Adds a directed edge from prerequisite to dependent node. */
  addEdge(from: string, to: string, condition: ExecutionEdgeCondition = 'success'): void {
    if (!this.steps.has(from)) throw new Error(`Execution edge source "${from}" does not exist.`);
    if (!this.steps.has(to)) throw new Error(`Execution edge target "${to}" does not exist.`);
    this.addDependency(to, from);
    if (condition !== 'success') {
      const index = this.edges.findIndex((edge) => edge.from === from && edge.to === to);
      this.edges[index] = createExecutionEdge(from, to, condition);
    }
  }

  /** Returns immutable steps in insertion order. */
  getSteps(): readonly ExecutionStep[] { return Object.freeze([...this.steps.values()]); }
  /** Returns immutable semantic nodes. */
  getNodes(): readonly ExecutionNode[] { return Object.freeze([...this.nodes.values()]); }
  /** Returns immutable directed edges. */
  getEdges(): readonly ExecutionEdge[] { return Object.freeze([...this.edges]); }

  /** Validates references and cycles without throwing. */
  validate(): ExecutionGraphValidation {
    const errors: string[] = [];
    for (const step of this.steps.values()) {
      for (const dependency of step.dependencies) if (!this.steps.has(dependency)) errors.push(`Step "${step.id}" requires missing step "${dependency}".`);
    }
    try { this.topologicalSort(); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze([...new Set(errors)]) });
  }

  /** Returns dependency-first order or throws when the graph is invalid. */
  getExecutionOrder(): readonly string[] {
    const missing = this.validateReferences();
    if (missing.length > 0) throw new Error(missing.join(' '));
    return Object.freeze(this.topologicalSort());
  }

  private validateReferences(): string[] {
    return this.getSteps().flatMap((step) => step.dependencies
      .filter((dependency) => !this.steps.has(dependency))
      .map((dependency) => `Step "${step.id}" requires missing step "${dependency}".`));
  }

  private topologicalSort(): string[] {
    const order: string[] = [];
    const state = new Map<string, 'visiting' | 'visited'>();
    const visit = (id: string, path: readonly string[]): void => {
      if (state.get(id) === 'visited') return;
      if (state.get(id) === 'visiting') throw new ExecutionGraphCycle([...path, id]);
      state.set(id, 'visiting');
      const step = this.steps.get(id);
      for (const dependency of step?.dependencies ?? []) if (this.steps.has(dependency)) visit(dependency, [...path, id]);
      state.set(id, 'visited');
      order.push(id);
    };
    for (const id of this.steps.keys()) visit(id, []);
    return order;
  }

  private addEdgeInternal(from: string, to: string, condition: ExecutionEdgeCondition): void {
    if (!this.edges.some((edge) => edge.from === from && edge.to === to)) this.edges.push(createExecutionEdge(from, to, condition));
  }
}

function inferNodeType(step: ExecutionStep): ExecutionNodeType {
  if (/analysis|detect|scene-memory/.test(step.capability)) return 'analysis';
  if (/validation|quality|preservation/.test(step.capability)) return 'validation';
  if (/composition/.test(step.capability)) return 'composition';
  if (/storage/.test(step.capability)) return 'storage';
  if (/generation|edit|try-on/.test(step.capability)) return 'generation';
  return 'processing';
}
