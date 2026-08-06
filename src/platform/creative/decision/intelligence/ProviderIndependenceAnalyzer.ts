import { immutable } from "./immutable";
import type { ProviderIndependenceResult } from "./refinementTypes";

export interface OperationPortability { isPortable(operation: string): boolean }
export class ProviderIndependenceAnalyzer {
  constructor(private readonly portability: OperationPortability = { isPortable: (operation) => !operation.startsWith("provider:") }) {}
  analyze(operations: readonly string[]): ProviderIndependenceResult {
    const portableOperations = operations.filter((operation) => this.portability.isPortable(operation));
    const restrictedOperations = operations.filter((operation) => !this.portability.isPortable(operation));
    return immutable({ score: operations.length ? portableOperations.length / operations.length : 1, portableOperations, restrictedOperations });
  }
}
