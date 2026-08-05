import type { WorkflowDefinition } from './WorkflowDefinition';
import { workflowTemplates } from './WorkflowTemplates';

export interface WorkflowComposeRequest { readonly intent: string; readonly category?: string; readonly metadata?: Record<string, unknown>; }

const matchers: Array<{ id: string; patterns: readonly RegExp[] }> = [
  { id: 'virtual-try-on', patterns: [/try.?on/i, /пример/i, /одежд/i, /garment/i] },
  { id: 'portrait-enhancement', patterns: [/portrait/i, /портрет/i, /лицо/i, /face/i] },
  { id: 'hair-color-edit', patterns: [/hair/i, /волос/i] },
  { id: 'background-replacement', patterns: [/background/i, /фон/i] },
  { id: 'image-edit-basic', patterns: [/edit/i, /image/i, /фото/i, /изображ/i] },
];

export class WorkflowComposer {
  compose(request: WorkflowComposeRequest): WorkflowDefinition {
    const normalized = request.intent.trim();
    const match = matchers.find((candidate) => candidate.patterns.some((pattern) => pattern.test(normalized)));
    const selected = workflowTemplates.find((template) => template.id === match?.id || template.category === request.category) ?? workflowTemplates[0];
    return { ...selected, metadata: { ...selected.metadata, userIntent: normalized, ...(request.metadata || {}) } };
  }
}
