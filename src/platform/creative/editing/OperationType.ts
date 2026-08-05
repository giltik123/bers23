export type OperationType =
  | 'brightness'
  | 'contrast'
  | 'saturation'
  | 'hue'
  | 'temperature'
  | 'color_correction'
  | 'background_replacement'
  | 'virtual_try_on'
  | 'remove_object'
  | 'generative_fill';

export type OperationExecution = 'LOCAL' | 'AI';
export type OperationStatus = 'PENDING' | 'APPLIED' | 'REVERTED' | 'FAILED';

export const localOperationTypes: readonly OperationType[] = Object.freeze(['brightness', 'contrast', 'saturation', 'hue', 'temperature', 'color_correction']);
export const aiOperationWorkflows: Readonly<Partial<Record<OperationType, string>>> = Object.freeze({
  background_replacement: 'background-replacement',
  virtual_try_on: 'virtual-try-on',
  remove_object: 'object-removal',
  generative_fill: 'generative-fill',
});
