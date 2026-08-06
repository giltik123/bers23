import type { CreativePipelineStep, OperationDependencyRule, PipelineOperation } from './types';

export class OperationDependencyResolver {
  rules(): OperationDependencyRule[] { return [{ operation: 'background_replacement', requires: ['segmentation'] }, { operation: 'object_removal', requires: ['segmentation'] }, { operation: 'repair_area', requires: ['object_removal'] }]; }

  order(operations: CreativePipelineStep[]): CreativePipelineStep[] {
    const byOperation = new Map<PipelineOperation, CreativePipelineStep>(operations.map((operation) => [operation.operation, operation]));
    const expanded = [...operations];
    for (const rule of this.rules()) {
      if (byOperation.has(rule.operation)) {
        for (const requirement of rule.requires) if (!byOperation.has(requirement)) expanded.unshift({ operation: requirement, source: requirement === 'segmentation' ? 'AI' : 'LOCAL', reason: `Required before ${rule.operation}`, estimatedCost: requirement === 'segmentation' ? 0 : 0 });
      }
    }
    return expanded.sort((left, right) => this.rank(left.operation) - this.rank(right.operation));
  }

  private rank(operation: PipelineOperation): number {
    return { segmentation: 1, object_removal: 2, repair_area: 3, background_replacement: 4, color_correction: 5, lighting_adjustment: 6, final_enhancement: 7, quality_check: 8, background_check: 8, virtual_try_on: 4, style_generation: 4 }[operation];
  }
}
