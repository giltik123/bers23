import type { AgentContext } from './AgentContext';
import type { AgentSession } from './AgentSession';
import type { AgentTask } from './TaskPlanner';
export interface AgentDebugSnapshot { readonly session: AgentSession; readonly goal?: string; readonly tasks: readonly { readonly id: string; readonly request: string; readonly dependencies: readonly string[] }[]; readonly context: AgentContext; readonly results: readonly unknown[]; }

/** Produces explainable agent snapshots for debug mode and future Enterprise audit. */
export class AgentDebugger { snapshot(session: AgentSession, context: AgentContext, tasks: readonly AgentTask[], results: readonly unknown[] = []): AgentDebugSnapshot { return Object.freeze({ session, goal: session.goal, tasks: Object.freeze(tasks.map((task) => Object.freeze({ id: task.id, request: task.request, dependencies: task.dependencies }))), context, results: Object.freeze([...results]) }); } }
