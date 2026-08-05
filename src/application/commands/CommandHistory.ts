import type { AICommand } from './AICommand';

export interface CommandHistoryRecord { readonly commandId: string; readonly input: string; readonly parsedIntent: string; readonly chosenWorkflow: string | null; readonly result?: unknown; readonly userFeedback?: unknown; readonly at: number; }

export class CommandHistory {
  private records: CommandHistoryRecord[] = [];
  record(command: AICommand, result?: unknown, userFeedback?: unknown): CommandHistoryRecord {
    const record = Object.freeze({ commandId: command.id, input: command.userInput, parsedIntent: command.intent, chosenWorkflow: command.requiredWorkflow, result, userFeedback, at: Date.now() });
    this.records.push(record);
    return record;
  }
  get(commandId: string): CommandHistoryRecord | null { return this.records.find((record) => record.commandId === commandId) ?? null; }
  list(): readonly CommandHistoryRecord[] { return Object.freeze([...this.records]); }
  clear(): void { this.records = []; }
}
