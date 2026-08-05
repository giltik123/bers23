import { WorkflowEngine, type WorkflowEngineOptions } from './WorkflowEngine';
import { WorkflowRegistry } from './WorkflowRegistry';
import { workflowTemplates } from './WorkflowTemplates';

export interface CreateWorkflowEngineOptions extends WorkflowEngineOptions { readonly registerTemplates?: boolean; }

export function createWorkflowEngine(options: CreateWorkflowEngineOptions = {}): WorkflowEngine {
  const registry = options.registry ?? new WorkflowRegistry();
  if (options.registerTemplates ?? true) workflowTemplates.forEach((definition) => { if (!registry.has(definition.id)) registry.register(definition); });
  return new WorkflowEngine({ ...options, registry });
}
