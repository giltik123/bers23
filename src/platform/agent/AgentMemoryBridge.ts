import type { ExecutionIntelligence } from '../intelligence';
import type { ContextBuilder, MemoryStore } from '../memory';
import type { AgentContext, AgentRequest } from './AgentContext';
import { freezeAgentContext } from './AgentContext';
import type { AgentSession } from './AgentSession';

export interface AgentMemoryBridgeServices { readonly builder?: ContextBuilder; readonly store?: MemoryStore; readonly intelligence?: ExecutionIntelligence; }

/** Reads and updates platform memory for agent sessions while preserving tenant boundaries. */
export class AgentMemoryBridge {
  constructor(private readonly services: AgentMemoryBridgeServices = {}) {}
  buildContext(request: AgentRequest): AgentContext { const memory = this.services.builder?.build({ request: request.request, tenantId: request.tenantId, userId: request.userId, projectId: request.projectId }); const intelligence = this.services.intelligence ? { performance: this.services.intelligence.analytics.performance.analyzeAll() } : {}; return freezeAgentContext({ tenantId: request.tenantId, userId: request.userId, projectId: request.projectId, budget: request.budget, memory: memory ? [...memory.relevant, ...memory.preferences, ...memory.workflows] : Object.freeze([]), intelligence, metadata: Object.freeze({ ...(request.metadata ?? {}) }) }); }
  remember(session: AgentSession, result: unknown): void { this.services.store?.save({ namespace: 'agent', category: 'WORKFLOW_MEMORY', owner: { tenantId: session.tenantId, userId: session.userId, projectId: session.projectId }, visibility: session.projectId ? 'PROJECT' : 'PRIVATE', value: { sessionId: session.sessionId, goal: session.goal, state: session.state, result }, tags: [session.goal ?? 'agent', session.state.toLowerCase()], confidence: session.state === 'COMPLETED' ? 0.9 : 0.35 }); }
}
