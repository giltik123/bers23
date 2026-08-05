import type { WorkflowDefinition } from './WorkflowDefinition';

export class WorkflowRegistry {
  private definitions = new Map<string, WorkflowDefinition>();

  register(definition: WorkflowDefinition): WorkflowDefinition {
    if (this.definitions.has(definition.id)) throw new Error(`Workflow is already registered: ${definition.id}.`);
    this.definitions.set(definition.id, definition);
    return definition;
  }

  upsert(definition: WorkflowDefinition): WorkflowDefinition { this.definitions.set(definition.id, definition); return definition; }
  get(id: string): WorkflowDefinition | null { return this.definitions.get(id) ?? null; }
  has(id: string): boolean { return this.definitions.has(id); }
  list(category?: string): WorkflowDefinition[] { return Array.from(this.definitions.values()).filter((definition) => !category || definition.category === category); }
  clear(): void { this.definitions.clear(); }
}
