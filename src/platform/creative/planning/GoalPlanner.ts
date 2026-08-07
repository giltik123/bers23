import { clamp, deepFreeze } from './immutable';
import type { GoalDefinition, GoalNode, PlanningDependencies } from './types';

export class GoalPlanner {
  constructor(private readonly dependencies: PlanningDependencies) {}

  decompose(goal: GoalDefinition): readonly GoalNode[] {
    const result: GoalNode[] = [];
    const visit = (definition: GoalDefinition, level: number, parentId?: string): string => {
      const id = this.dependencies.id();
      const childIds = (definition.subGoals ?? []).map((child) => visit(child, level + 1, id));
      result.push({
        id,
        title: definition.title,
        description: definition.description ?? '',
        level,
        priority: clamp(definition.priority ?? 0.5),
        parentId,
        childIds,
        operations: [...new Set(definition.operations ?? [])].sort(),
        tags: [...new Set(definition.tags ?? [])].sort(),
      });
      return id;
    };
    visit(goal, 0);
    return deepFreeze(result.sort((a, b) => a.level - b.level || a.id.localeCompare(b.id)));
  }
}
