import { immutable } from './immutable';
import { ThoughtGraph } from './ThoughtGraph';
import type { BlackboardPatch, BlackboardState, CognitiveScope } from './types';

const sameScope = (left: CognitiveScope, right: CognitiveScope) => left.tenantId === right.tenantId && left.projectId === right.projectId && left.userId === right.userId;

export class CreativeBlackboard {
  create(scope: CognitiveScope): BlackboardState {
    return immutable({ ...scope, version: 0, goals: [], constraints: [], evidence: [], experts: [], conflicts: [], assumptions: [], risks: [], unknowns: [], alternatives: [], worldState: {}, thoughtGraph: ThoughtGraph.build([], []) });
  }

  write(state: BlackboardState, scope: CognitiveScope, patch: BlackboardPatch): BlackboardState {
    if (!sameScope(state, scope)) throw new Error('Cognitive blackboard scope violation');
    const thoughts = [...state.thoughtGraph.thoughts, ...(patch.thoughts ?? [])];
    const relations = [...state.thoughtGraph.relations, ...(patch.relations ?? [])];
    return immutable({
      ...state,
      version: state.version + 1,
      goals: [...state.goals, ...(patch.goals ?? [])], constraints: [...state.constraints, ...(patch.constraints ?? [])], evidence: [...state.evidence, ...(patch.evidence ?? [])], experts: [...new Set([...state.experts, ...(patch.experts ?? [])])], conflicts: [...state.conflicts, ...(patch.conflicts ?? [])], assumptions: [...state.assumptions, ...(patch.assumptions ?? [])], risks: [...state.risks, ...(patch.risks ?? [])], unknowns: [...state.unknowns, ...(patch.unknowns ?? [])], alternatives: [...state.alternatives, ...(patch.alternatives ?? [])], worldState: { ...state.worldState, ...(patch.worldState ?? {}) }, thoughtGraph: ThoughtGraph.build(thoughts, relations),
    });
  }
}
