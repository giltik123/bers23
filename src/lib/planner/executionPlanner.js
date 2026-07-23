import { ACTIONS } from '@/lib/planner/intentAnalyzer';

// ExecutionPlanner — decides WHAT steps a future execution needs. Nothing runs here.

// Returns { needs, order[], estimatedDurationSeconds }
export function buildExecutionPlan({ intent, object }) {
  const action = intent?.action || ACTIONS.CUSTOM_PROMPT;

  const needs = {
    segmentation: intent?.scope === 'object' && !object?.mask_url,
    editing: action !== ACTIONS.VIRTUAL_TRY_ON,
    tryon: action === ACTIONS.VIRTUAL_TRY_ON,
    multipleObjects: false,
    backgroundPreservation: intent?.scope === 'object',
    facePreservation: ![ACTIONS.FACE_EDIT, ACTIONS.HAIR_EDIT, ACTIONS.VIRTUAL_TRY_ON].includes(action),
    identityPreservation: true,
  };

  const order = [];
  if (needs.segmentation) order.push({ step: 'segmentation', label: 'Isolate object' });
  if (needs.tryon) order.push({ step: 'tryon', label: 'Virtual try-on' });
  if (needs.editing) order.push({ step: 'editing', label: 'Apply AI edit' });
  order.push({ step: 'save', label: 'Save to project history' });

  // Rough per-step estimates (seconds), refined once real providers are connected.
  const estimatedDurationSeconds =
    (needs.segmentation ? 5 : 0) + (needs.tryon ? 20 : 0) + (needs.editing ? 15 : 0) + 2;

  return { needs, order, estimatedDurationSeconds };
}