import { immutableOperationClone } from '../immutable';
import type { CapabilityResult, OperationCapability, OperationDescriptor } from '../types';

export class CapabilityMatcher {
  match(descriptor: OperationDescriptor, available: readonly OperationCapability[]): CapabilityResult {
    const availableSet = new Set(available);
    const missing = descriptor.requiredCapabilities.filter((capability) => !availableSet.has(capability));
    return immutableOperationClone({ matched: missing.length === 0, missing });
  }
}
