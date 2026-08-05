import { defineWorkflow, type WorkflowDefinition } from './WorkflowDefinition';
import { defineWorkflowStep } from './WorkflowStep';

export const workflowTemplates: readonly WorkflowDefinition[] = Object.freeze([
  defineWorkflow({ id: 'image-edit-basic', name: 'Image Editing', description: 'Basic image editing workflow for prompt-guided image changes.', category: 'image-editing', requirements: ['source-image', 'edit-prompt'], capabilities: ['image.analysis', 'image.edit', 'quality.validation'], budget: { maxCredits: 30, maxDurationMs: 90_000, maxProviderCalls: 3 }, riskLevel: 'low', metadata: { template: true }, steps: [
    defineWorkflowStep({ id: 'analyze-image', name: 'Image Analysis', kind: 'analysis', capability: 'image.analysis', dependsOn: [] }),
    defineWorkflowStep({ id: 'apply-edit', name: 'Apply Edit', kind: 'generation', capability: 'image.edit', dependsOn: ['analyze-image'], recovery: { strategy: 'retry', maxAttempts: 2 } }),
    defineWorkflowStep({ id: 'validate-quality', name: 'Quality Validation', kind: 'validation', capability: 'quality.validation', dependsOn: ['apply-edit'], recovery: { strategy: 'fallback', fallbackStepId: 'apply-edit' } }),
  ] }),
  defineWorkflow({ id: 'portrait-enhancement', name: 'Portrait Enhancement', description: 'Enhance portrait lighting, skin tone, and face-preserving details.', category: 'portrait', requirements: ['portrait-image'], capabilities: ['face.analysis', 'portrait.enhance', 'quality.validation'], budget: { maxCredits: 35, maxDurationMs: 120_000, maxProviderCalls: 3 }, riskLevel: 'medium', metadata: { template: true, preservesIdentity: true }, steps: [
    defineWorkflowStep({ id: 'person-analysis', name: 'Person Analysis', kind: 'analysis', capability: 'face.analysis', dependsOn: [] }),
    defineWorkflowStep({ id: 'enhance-portrait', name: 'Portrait Enhancement', kind: 'generation', capability: 'portrait.enhance', dependsOn: ['person-analysis'], recovery: { strategy: 'retry', maxAttempts: 2 } }),
    defineWorkflowStep({ id: 'portrait-quality', name: 'Quality Validation', kind: 'validation', capability: 'quality.validation', dependsOn: ['enhance-portrait'] }),
  ] }),
  defineWorkflow({ id: 'hair-color-edit', name: 'Hair Color Change', description: 'Detect hair region and apply controlled color transformation.', category: 'portrait', requirements: ['portrait-image', 'target-hair-color'], capabilities: ['hair.segmentation', 'hair.color.edit', 'quality.validation'], budget: { maxCredits: 40, maxDurationMs: 120_000, maxProviderCalls: 3 }, riskLevel: 'medium', metadata: { template: true }, steps: [
    defineWorkflowStep({ id: 'hair-analysis', name: 'Hair Segmentation', kind: 'analysis', capability: 'hair.segmentation', dependsOn: [] }),
    defineWorkflowStep({ id: 'change-hair-color', name: 'Hair Color Edit', kind: 'generation', capability: 'hair.color.edit', dependsOn: ['hair-analysis'], recovery: { strategy: 'retry', maxAttempts: 2 } }),
    defineWorkflowStep({ id: 'hair-quality', name: 'Quality Validation', kind: 'validation', capability: 'quality.validation', dependsOn: ['change-hair-color'] }),
  ] }),
  defineWorkflow({ id: 'virtual-try-on', name: 'Virtual Try-On', description: 'Analyze person and garment, run virtual try-on, validate fit, and compose output.', category: 'fashion', requirements: ['person-image', 'garment-image'], capabilities: ['person.analysis', 'garment.processing', 'virtual.tryon', 'quality.validation', 'image.composition'], budget: { maxCredits: 60, maxDurationMs: 180_000, maxProviderCalls: 5 }, riskLevel: 'medium', metadata: { template: true }, steps: [
    defineWorkflowStep({ id: 'person-analysis', name: 'Person Analysis', kind: 'analysis', capability: 'person.analysis', dependsOn: [] }),
    defineWorkflowStep({ id: 'garment-processing', name: 'Garment Processing', kind: 'processing', capability: 'garment.processing', dependsOn: [] }),
    defineWorkflowStep({ id: 'virtual-try-on', name: 'Virtual Try-On', kind: 'generation', capability: 'virtual.tryon', dependsOn: ['person-analysis', 'garment-processing'], recovery: { strategy: 'retry', maxAttempts: 2 } }),
    defineWorkflowStep({ id: 'quality-validation', name: 'Quality Validation', kind: 'validation', capability: 'quality.validation', dependsOn: ['virtual-try-on'], recovery: { strategy: 'fallback', fallbackStepId: 'virtual-try-on' } }),
    defineWorkflowStep({ id: 'composition', name: 'Composition', kind: 'composition', capability: 'image.composition', dependsOn: ['quality-validation'] }),
  ] }),
  defineWorkflow({ id: 'background-replacement', name: 'Background Replacement', description: 'Segment subject, generate replacement background, and compose final image.', category: 'background', requirements: ['source-image', 'background-prompt'], capabilities: ['subject.segmentation', 'background.generation', 'image.composition'], budget: { maxCredits: 45, maxDurationMs: 120_000, maxProviderCalls: 3 }, riskLevel: 'low', metadata: { template: true }, steps: [
    defineWorkflowStep({ id: 'subject-segmentation', name: 'Subject Segmentation', kind: 'analysis', capability: 'subject.segmentation', dependsOn: [] }),
    defineWorkflowStep({ id: 'generate-background', name: 'Background Generation', kind: 'generation', capability: 'background.generation', dependsOn: [] }),
    defineWorkflowStep({ id: 'compose-background', name: 'Composition', kind: 'composition', capability: 'image.composition', dependsOn: ['subject-segmentation', 'generate-background'] }),
  ] }),
]);
