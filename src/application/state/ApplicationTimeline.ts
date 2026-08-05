import { immutable } from './AIApplicationState';

export type ApplicationTimelineEventType =
  | 'state.created'
  | 'command.received'
  | 'workflow.started'
  | 'execution.started'
  | 'decision.requested'
  | 'decision.completed'
  | 'asset.created'
  | 'execution.completed'
  | 'state.failed'
  | 'state.transitioned'
  | 'state.restored'
  | 'state.recovered';

export interface ApplicationTimelineEvent {
  readonly id: string;
  readonly stateId: string;
  readonly type: ApplicationTimelineEventType;
  readonly at: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export class ApplicationTimeline {
  readonly #events = new Map<string, ApplicationTimelineEvent[]>();

  record(stateId: string, type: ApplicationTimelineEventType, payload: Readonly<Record<string, unknown>> = {}): ApplicationTimelineEvent {
    const event = immutable({
      id: `state_event_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      stateId,
      type,
      at: new Date().toISOString(),
      payload: { ...payload },
    });

    this.#events.set(stateId, [...(this.#events.get(stateId) || []), event]);
    return event;
  }

  list(stateId: string): readonly ApplicationTimelineEvent[] {
    return immutable([...(this.#events.get(stateId) || [])]);
  }
}
