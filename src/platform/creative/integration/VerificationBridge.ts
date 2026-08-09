import { deepFreeze } from './immutable';
import type { VerificationComparison, VerificationInput } from './types';

export class VerificationBridge {
  compare(input: VerificationInput): readonly VerificationComparison[] {
    return deepFreeze(input.workflow.steps.filter((step) => step.verificationRequired).map((step) => {
      const actual = input.actual.operations.find((item) => item.stepId === step.id);
      const workflowStageIndex = input.workflow.stages.findIndex((stage) => stage.stepIds.includes(step.id));
      const expectedStep = input.expected[workflowStageIndex];
      const expected = expectedStep?.threshold ?? 0.8;
      const actualQuality = actual?.metrics.quality ?? (actual?.status === 'completed' ? 1 : 0);
      return {
        executionNodeId: step.executionNodeId, expected, actual: actualQuality,
        passed: actual?.status === 'completed' && actualQuality >= expected,
        difference: actualQuality - expected,
        reason: actual ? `Workflow status ${actual.status}; quality ${actualQuality}` : 'Workflow result missing',
      };
    }));
  }
}
