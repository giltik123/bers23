import { deepFreeze, sameScope } from './immutable';
import type { ExecutionScope } from '../execution';
import type { ExecutionEvent, ExecutionEventType, IntegrationDependencies } from './types';

export class ExecutionEventLog {
  private events: readonly ExecutionEvent[] = [];
  constructor(private readonly dependencies: IntegrationDependencies) {}

  append(scope: ExecutionScope, workflowId: string, type: ExecutionEventType, message: string, executionNodeId?: string): ExecutionEvent {
    const event = deepFreeze({ id: this.dependencies.id(), scope: { ...scope }, workflowId, executionNodeId, type, message, timestamp: this.dependencies.now() }) as ExecutionEvent;
    this.events = deepFreeze([...this.events, event]);
    return event;
  }

  list(scope: ExecutionScope, workflowId?: string): readonly ExecutionEvent[] {
    return deepFreeze(this.events.filter((event) => sameScope(event.scope, scope) && (!workflowId || event.workflowId === workflowId)));
  }
}
