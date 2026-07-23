import { ACTIONS } from '@/lib/planner/intentAnalyzer';

// ValidationService — rejects impossible requests before anything executes.

const SUPPORTED_ACTIONS = Object.values(ACTIONS);

// Returns { valid, errors[] }
export function validatePlan({ project, instruction, intent, resolution }) {
  const errors = [];

  if (!project) errors.push('No project loaded');
  if (project && !project.current_image_url) errors.push('Project has no image');
  if (!(instruction || '').trim()) errors.push('Instruction is empty');
  if (intent && !SUPPORTED_ACTIONS.includes(intent.action)) errors.push(`Unsupported action: ${intent.action}`);
  if (intent?.scope === 'object' && resolution?.needsClarification) {
    errors.push('No object selected — select an object or describe which one to edit');
  }
  // Conflicting request: asks to both remove and add/replace the same target.
  const text = (instruction || '').toLowerCase();
  if (/\bremove\b|\bdelete\b/.test(text) && /\badd\b|\breplace\b/.test(text)) {
    errors.push('Conflicting request: both removing and adding/replacing');
  }

  return { valid: errors.length === 0, errors };
}