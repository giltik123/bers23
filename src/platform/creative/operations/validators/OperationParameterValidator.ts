import { immutableOperationClone } from '../immutable';
import type { OperationDescriptor, ParameterRule, ValidationResult } from '../types';

export class OperationParameterValidator {
  validate(descriptor: OperationDescriptor, parameters: Readonly<Record<string, unknown>>): ValidationResult {
    const errors: string[] = [];
    for (const [name, rule] of Object.entries(descriptor.parameters)) {
      const value = parameters[name];
      if (value === undefined) {
        if (rule.required) errors.push(`${name} is required`);
        continue;
      }
      this.#validateValue(name, value, rule, errors);
    }
    for (const name of Object.keys(parameters)) {
      if (!descriptor.parameters[name]) errors.push(`${name} is not supported`);
    }
    return immutableOperationClone({ valid: errors.length === 0, errors });
  }

  #validateValue(name: string, value: unknown, rule: ParameterRule, errors: string[]): void {
    if (typeof value !== rule.type) {
      errors.push(`${name} must be ${rule.type}`);
      return;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) errors.push(`${name} must be finite`);
      if (rule.integer && !Number.isInteger(value)) errors.push(`${name} must be an integer`);
      if (rule.minimum !== undefined && value < rule.minimum) errors.push(`${name} must be at least ${rule.minimum}`);
      if (rule.maximum !== undefined && value > rule.maximum) errors.push(`${name} must be at most ${rule.maximum}`);
    }
    if (rule.values && !rule.values.includes(value as never)) errors.push(`${name} has an unsupported value`);
  }
}
