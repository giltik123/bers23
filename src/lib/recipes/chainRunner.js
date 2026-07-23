import { recipeManager } from '@/lib/recipes/recipeManager';
import { recipeEngine } from '@/lib/recipes/recipeEngine';
import { aiPlanner } from '@/lib/planner/aiPlanner';
import { editingEngine } from '@/lib/editing/editingEngine';

// ChainRunner — executes recipe chains step by step. Each step's output image becomes
// the next step's input. Every step goes through Planner → Editing Engine; no shortcuts.
class ChainRunner {
  constructor() { this.cancelled = false; }

  cancel() {
    this.cancelled = true;
    editingEngine.cancel();
  }

  // onProgress(steps) — steps: [{ label, status: 'pending'|'running'|'done'|'failed' }]
  // onStepCommitted(result, step, recipe) — caller persists the step result to history.
  async run({ chain, project, objects = [], onProgress, onStepCommitted }) {
    this.cancelled = false;
    const steps = chain.steps.map((s) => ({ label: s.label, status: 'pending' }));
    const emit = () => onProgress?.([...steps]);
    let currentUrl = project.current_image_url;
    emit();

    for (let i = 0; i < chain.steps.length; i++) {
      if (this.cancelled) throw Object.assign(new Error('Chain cancelled'), { code: 'cancelled' });
      const step = chain.steps[i];
      steps[i].status = 'running';
      emit();

      const recipe = recipeManager.get(step.recipeId);
      const started = performance.now();
      try {
        if (!recipe) throw new Error(`Unknown recipe: ${step.recipeId}`);
        const compiled = recipeEngine.compile(recipe, step.variables || {});

        // Best-effort object targeting from the step's hints.
        const target = (step.objectHints || []).length
          ? objects.find((o) => step.objectHints.some((h) => (o.label || '').toLowerCase().includes(h)))
          : null;

        const projectLike = { ...project, current_image_url: currentUrl };
        const plan = aiPlanner.plan({ project: projectLike, instruction: compiled.prompt, objects, selectedObject: target || null });
        if (plan.status !== 'ready') {
          throw new Error(plan.validation?.errors?.join('. ') || `Step "${step.label}" could not be planned`);
        }

        const result = await editingEngine.execute({
          project: projectLike, plan,
          instruction: compiled.prompt,
          objects: target ? [target] : [],
        });

        recipeEngine.recordOutcome(recipe.id, { success: true, durationMs: performance.now() - started, credits: result.credits_used || 0 });
        await onStepCommitted?.(result, step, recipe);
        currentUrl = result.image_url;
        steps[i].status = 'done';
        emit();
      } catch (error) {
        recipeEngine.recordOutcome(recipe?.id, { success: false, durationMs: performance.now() - started, credits: 0 });
        steps[i].status = 'failed';
        emit();
        throw error;
      }
    }
    return { finalImageUrl: currentUrl, steps };
  }
}

export const chainRunner = new ChainRunner();