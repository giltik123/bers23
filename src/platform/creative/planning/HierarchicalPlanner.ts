import { clamp } from './immutable';
import { PlanGraph } from './PlanGraph';
import type { GoalNode, PlanNode, PlanningDependencies, PlanningScope } from './types';

export class HierarchicalPlanner {
  constructor(private readonly dependencies: PlanningDependencies) {}

  build(goals: readonly GoalNode[], scope: PlanningScope): PlanGraph {
    const graph = new PlanGraph();
    const byGoal = new Map<string, PlanNode>();
    for (const goal of goals) {
      const goalNode = graph.addNode(this.node(scope, goal, 'goal', goal.title));
      byGoal.set(goal.id, goalNode);
      for (const operation of goal.operations) {
        const operationNode = graph.addNode(this.node(scope, goal, 'operation', operation, operation));
        graph.addEdge({ source: goalNode.id, target: operationNode.id, relation: 'decomposes-to' }, scope);
      }
    }
    for (const goal of goals) {
      if (!goal.parentId) continue;
      graph.addEdge({ source: byGoal.get(goal.parentId)!.id, target: byGoal.get(goal.id)!.id, relation: 'decomposes-to' }, scope);
    }
    return graph;
  }

  private node(scope: PlanningScope, goal: GoalNode, type: PlanNode['type'], title: string, operation?: string): PlanNode {
    const local = operation ? !/generate|try-on|replace|ai/i.test(operation) : true;
    return {
      id: this.dependencies.id(), scope: { ...scope }, type, title, goalId: goal.id, operation,
      dependencies: [], status: 'planned', quality: clamp(0.65 + goal.priority * 0.3),
      cost: operation ? (local ? 0 : 10) : 0, latency: operation ? (local ? 1 : 5) : 0,
      risk: operation ? (local ? 0.1 : 0.3) : 0.05, local, ai: !local, tags: goal.tags,
    };
  }
}
