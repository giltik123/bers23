import { immutable } from './InteractionModel';

export type InteractionHistoryEventType =
  | 'interaction.received'
  | 'interaction.started'
  | 'interaction.waiting_user'
  | 'interaction.confirmed'
  | 'interaction.rejected'
  | 'interaction.completed'
  | 'interaction.failed';

export interface InteractionHistoryEvent {
  readonly id: string;
  readonly requestId: string;
  readonly type: InteractionHistoryEventType;
  readonly at: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export class InteractionHistory {
  readonly #events = new Map<string, InteractionHistoryEvent[]>();

  record(requestId: string, type: InteractionHistoryEventType, payload: Readonly<Record<string, unknown>> = {}): InteractionHistoryEvent {
    const event = immutable({
      id: `interaction_event_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      requestId,
      type,
      at: new Date().toISOString(),
      payload: { ...payload },
    });

    this.#events.set(requestId, [...(this.#events.get(requestId) || []), event]);
    return event;
  }

  snapshot(requestId: string): readonly InteractionHistoryEvent[] {
    return immutable([...(this.#events.get(requestId) || [])]);
  }
}
