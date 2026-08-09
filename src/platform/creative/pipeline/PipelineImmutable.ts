import type { PipelineScope } from './ImagePipelineTypes';

export function pipelineDeepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (value === null || typeof value !== 'object' || seen.has(value as object)) return value as Readonly<T>;
  seen.add(value as object);
  for (const nested of Object.values(value as Record<string, unknown>)) pipelineDeepFreeze(nested, seen);
  return Object.freeze(value) as Readonly<T>;
}

export const pipelineClamp = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export const samePipelineScope = (left: PipelineScope, right: PipelineScope): boolean => (
  left.tenantId === right.tenantId && left.projectId === right.projectId && left.userId === right.userId
);
