import { recipeManager } from '@/lib/recipes/recipeManager';
import { recipeEngine } from '@/lib/recipes/recipeEngine';
import { aiPlanner } from '@/lib/planner/aiPlanner';
import { editingEngine } from '@/lib/editing/editingEngine';
import { taskHistory } from '@/lib/agent/taskHistory';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ExecutionQueue — runs agent tasks sequentially, each through
// Recipe Engine → AI Planner → Editing Engine. Supports pause/resume/cancel/skip/retry/reorder.
class ExecutionQueue {
  constructor() {
    this.tasks = [];
    this.running = false;
    this.paused = false;
    this.cancelled = false;
    this.listeners = new Set();
  }

  subscribe(fn) { this.listeners.add(fn); fn(this.snapshot()); return () => this.listeners.delete(fn); }
  snapshot() { return { tasks: [...this.tasks], running: this.running, paused: this.paused }; }
  emit() { const s = this.snapshot(); this.listeners.forEach((fn) => fn(s)); }

  load(tasks) { this.tasks = tasks.map((t) => ({ ...t })); this.emit(); }
  clear() { this.tasks = []; this.running = false; this.paused = false; this.emit(); }
  add(task) { this.tasks = [...this.tasks, task]; this.emit(); }

  updateTask(id, patch) { this.tasks = this.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)); this.emit(); }
  setEnabled(id, enabled) { this.updateTask(id, { enabled }); }
  skip(id) { this.updateTask(id, { status: 'skipped' }); }
  retry(id) { this.updateTask(id, { status: 'pending', error: null }); }

  move(id, dir) {
    const i = this.tasks.findIndex((t) => t.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= this.tasks.length) return;
    const next = [...this.tasks];
    [next[i], next[j]] = [next[j], next[i]];
    this.tasks = next;
    this.emit();
  }

  pause() { this.paused = true; this.emit(); }
  resume() { this.paused = false; this.emit(); }
  cancel() { this.cancelled = true; this.paused = false; editingEngine.cancel(); this.emit(); }

  async waitIfPaused() { while (this.paused && !this.cancelled) await sleep(300); }

  // onCommit(result, task) — caller persists each result to project history (snapshot per task).
  async run({ project, objects = [], onCommit }) {
    this.cancelled = false;
    this.running = true;
    if (!taskHistory.list().length) taskHistory.startRun();
    let currentUrl = project.current_image_url;
    this.emit();

    try {
      for (let i = 0; i < this.tasks.length; i++) {
        await this.waitIfPaused();
        if (this.cancelled) break;
        const task = this.tasks[i];
        if (!task.enabled || task.status === 'done' || task.status === 'skipped') continue;
        this.updateTask(task.id, { status: 'running', error: null });

        try {
          const recipe = task.recipe ? recipeManager.get(task.recipe) : null;
          const compiled = recipe ? recipeEngine.compile(recipe, task.variables || {}) : null;
          const instruction = task.customPrompt || compiled?.prompt;
          if (!instruction) throw new Error('Task has no prompt');

          const hint = (task.targetObject || '').toLowerCase();
          const target = hint
            ? objects.find((o) => (o.label || '').toLowerCase().includes(hint) || hint.includes((o.label || '').toLowerCase()))
            : null;

          const projectLike = { ...project, current_image_url: currentUrl };
          const plan = aiPlanner.plan({ project: projectLike, instruction, objects, selectedObject: target || null });
          if (plan.status !== 'ready') {
            throw new Error(plan.validation?.errors?.join('. ') || `"${task.label}" could not be planned`);
          }

          const result = await editingEngine.execute({
            project: projectLike, plan, instruction,
            objects: target ? [target] : [],
          });

          if (recipe) recipeEngine.recordOutcome(recipe.id, { success: true, durationMs: result.generation_time_ms || 0, credits: result.credits_used || 0 });
          taskHistory.record({ taskId: task.id, label: task.label, beforeUrl: currentUrl, afterUrl: result.image_url, credits: result.credits_used || 0 });
          await onCommit?.(result, task);
          currentUrl = result.image_url;
          this.updateTask(task.id, { status: 'done' });
        } catch (error) {
          if (task.recipe) recipeEngine.recordOutcome(task.recipe, { success: false, durationMs: 0, credits: 0 });
          this.updateTask(task.id, { status: error.code === 'cancelled' ? 'pending' : 'failed', error: error.code === 'cancelled' ? null : error.message });
          if (error.code === 'cancelled') break;
          break; // stop on failure — user can retry or skip, then run again
        }
      }
    } finally {
      this.running = false;
      this.emit();
    }
  }
}

export const executionQueue = new ExecutionQueue();