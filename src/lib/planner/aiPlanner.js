import { analyzeIntent } from '@/lib/planner/intentAnalyzer';
import { resolveObject } from '@/lib/planner/objectResolver';
import { buildPrompt } from '@/lib/planner/promptBuilder';
import { buildExecutionPlan } from '@/lib/planner/executionPlanner';
import { validatePlan } from '@/lib/planner/validationService';
import { estimateCredits } from '@/lib/planner/creditEstimator';
import { logPlan } from '@/lib/planner/plannerLogger';

export const PLANNER_VERSION = '1.0.0';

// AIPlanner — the ONLY coordinator of AI operations.
// Pipeline: intent → object resolution → validation → execution plan → prompt → credits.
// Nothing is executed here; the result is a plan ready for future execution.
export const aiPlanner = {
  // Returns { status: 'ready'|'invalid'|'needs_clarification', intent, resolution,
  //           validation, executionPlan, prompt, credits, plannerVersion }
  plan({ project, instruction, objects = [], selectedObject = null }) {
    const intent = analyzeIntent(instruction, selectedObject);
    const resolution = resolveObject({ objects, selectedObject, prompt: instruction, intent });
    const validation = validatePlan({ project, instruction, intent, resolution });
    const executionPlan = buildExecutionPlan({ intent, object: resolution.object });
    const prompt = buildPrompt({ intent, object: resolution.object, instruction });
    const credits = estimateCredits({ plan: executionPlan, project });

    let status = 'ready';
    if (!validation.valid) status = 'invalid';
    else if (resolution.needsClarification) status = 'needs_clarification';

    const result = {
      status,
      intent,
      resolution,
      validation,
      executionPlan,
      prompt,
      credits,
      plannerVersion: PLANNER_VERSION,
    };

    logPlan({
      prompt: instruction,
      resolved_object: resolution.object?.label || null,
      execution_plan: executionPlan.order.map((s) => s.step),
      validation_result: validation,
      estimated_credits: credits.credits,
      planner_version: PLANNER_VERSION,
      status,
    });

    return result;
  },
};