import { coreClient } from '@/api/coreClient';
import { RECIPE_LIBRARY } from '@/lib/recipes/recipeLibrary';

// RequestParser — converts one natural-language request into raw structured task specs
// via LLM. Output is normalized by the TaskExtractor; nothing here executes edits.
class RequestParser {
  async parse({ request, objects = [] }) {
    const catalog = RECIPE_LIBRARY.map((r) => `${r.id}: ${r.name} — ${r.description}`).join('\n');
    const labels = objects.map((o) => o.label).filter(Boolean).join(', ') || 'none detected';

    const result = await coreClient.integrations.Core.InvokeLLM({
      prompt: `You are an AI photo-editing planner. Split the user's request into individual editing tasks.

User request: "${request}"

Objects detected in the image: ${labels}

Available recipes (use recipe_id when one clearly matches, otherwise leave it empty and write a precise prompt):
${catalog}

Rules:
- One task per distinct edit (e.g. "make hair longer and remove the man" = 2 tasks).
- target_object: the object label the edit applies to (from the detected objects when possible), or empty for whole-image edits.
- action: one of remove, add, replace, recolor, restyle, enhance, relight, background, other.
- depends_on: indices (0-based) of tasks that must run BEFORE this one (e.g. removing a person before enhancing the background).
- ambiguous: true if the request part is unclear, with ambiguity_reason explaining what is missing.
- prompt: a complete, self-contained editing instruction for this single task.`,
      response_json_schema: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                action: { type: 'string' },
                target_object: { type: 'string' },
                recipe_id: { type: 'string' },
                prompt: { type: 'string' },
                depends_on: { type: 'array', items: { type: 'integer' } },
                ambiguous: { type: 'boolean' },
                ambiguity_reason: { type: 'string' },
              },
            },
          },
        },
      },
    });
    return result?.tasks || [];
  }
}

export const requestParser = new RequestParser();