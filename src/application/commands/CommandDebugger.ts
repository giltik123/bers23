import type { AICommand } from './AICommand';
import type { CommandPlan } from './CommandPlanner';

export interface CommandDebugSnapshot { readonly id: string; readonly input: string; readonly intent: string; readonly capabilities: readonly string[]; readonly workflow: string | null; readonly execution?: unknown; readonly provider?: unknown; readonly result?: unknown; readonly timeline: readonly { readonly type: string; readonly at: number; readonly payload?: unknown }[]; }

export class CommandDebugger {
  private events = new Map<string, Array<{ type: string; at: number; payload?: unknown }>>();
  track(commandId: string, type: string, payload?: unknown): void { this.events.set(commandId, [...(this.events.get(commandId) || []), { type, at: Date.now(), payload }]); }
  debug(command: AICommand, plan?: CommandPlan, result?: unknown): CommandDebugSnapshot {
    return Object.freeze({ id: command.id, input: command.userInput, intent: command.intent, capabilities: command.requiredCapabilities, workflow: plan?.recommendation.workflow || command.requiredWorkflow, execution: result && { status: (result as { status?: string }).status, executionId: (result as { executionId?: string }).executionId }, provider: (result as { intelligenceSummary?: { providers?: unknown } } | undefined)?.intelligenceSummary?.providers, result, timeline: Object.freeze([...(this.events.get(command.id) || [])]) });
  }
  clear(): void { this.events.clear(); }
}
