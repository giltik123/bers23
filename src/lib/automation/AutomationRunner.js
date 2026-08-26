import { recipeManager } from '@/lib/recipes/recipeManager';
import { recipeEngine } from '@/lib/recipes/recipeEngine';
import { automationValidator } from '@/lib/automation/AutomationValidator';
import { automationVariables } from '@/lib/automation/AutomationVariables';

const dispatch = (action, variables) => action.type === 'run_recipe'
  ? { ...action, compiledRecipe: recipeEngine.compile(recipeManager.get(action.recipeId) || recipeManager.all()[0], variables) }
  : {
      ...action,
      variables,
      orchestrationTarget: action.type === 'run_ai_agent'
        ? 'AI Agent → Recipe Engine → AI Planner → Job System → Editing Engine'
        : 'AI Planner → Recipe Engine → Job System → Editing Engine',
    };

function buildPlan({ automation, context = {} }) {
  const validation = automationValidator.validate(automation, context);
  if (!validation.valid) {
    const error = new Error(validation.errors.join(' '));
    error.code = 'AUTOMATION_PLAN_INVALID';
    throw error;
  }
  const variables = automationVariables.resolve(automation.variables, context);
  return Object.freeze({
    status: 'PLANNED_NOT_EXECUTED',
    automationId: automation.automation_id,
    variables: Object.freeze({ ...variables }),
    actions: Object.freeze(automation.actions.map((action) => Object.freeze(dispatch(action, variables)))),
  });
}

// Preview/planning surface only. Durable automation execution is intentionally
// fail-closed until a server-owned run authority is wired through Execution Fabric.
export const automationRunner = Object.freeze({
  plan(input) {
    return buildPlan(input);
  },
  async run(input) {
    buildPlan(input);
    const error = new Error('Automation execution is not wired to a durable server authority.');
    error.code = 'AUTOMATION_EXECUTION_NOT_WIRED';
    throw error;
  },
});
