import { immutable } from './immutable';
import type { KernelDependencies, KernelMessage, KernelScope } from './types';

type Handler = (message: KernelMessage) => void;
const sameScope = (left: KernelScope, right: KernelScope) => left.tenantId === right.tenantId && left.projectId === right.projectId && left.userId === right.userId;

export class MessageBus {
  private readonly messages: KernelMessage[] = [];
  private readonly subscribers = new Map<string, Map<string, Handler>>();
  constructor(private readonly dependencies: KernelDependencies) {}

  subscribe(topic: string, subscriberId: string, handler: Handler): () => void {
    const topicSubscribers = this.subscribers.get(topic) ?? new Map<string, Handler>();
    topicSubscribers.set(subscriberId, handler);
    this.subscribers.set(topic, topicSubscribers);
    return () => topicSubscribers.delete(subscriberId);
  }

  publish(input: KernelScope & { sessionId: string; topic: string; sender: string; payload: Readonly<Record<string, unknown>> }): KernelMessage {
    const sequence = this.messages.filter((message) => message.sessionId === input.sessionId && sameScope(message, input)).length;
    const message = immutable({ ...input, id: this.dependencies.nextId(), payload: structuredClone(input.payload), sequence, createdAt: this.dependencies.now() });
    this.messages.push(message);
    for (const handler of this.subscribers.get(input.topic)?.values() ?? []) handler(message);
    return message;
  }

  history(sessionId: string, scope: KernelScope, topic?: string): readonly KernelMessage[] {
    return immutable(this.messages.filter((message) => message.sessionId === sessionId && sameScope(message, scope) && (!topic || message.topic === topic)).map((message) => structuredClone(message)));
  }
}
