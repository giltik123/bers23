/** Base error for deterministic platform registration failures. */
export class PlatformRegistryError extends Error {
  constructor(message: string, readonly code: string, readonly moduleId?: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Raised when a module identifier is already registered. */
export class DuplicateModuleError extends PlatformRegistryError {
  constructor(moduleId: string) { super(`Platform module "${moduleId}" is already registered.`, 'DUPLICATE_MODULE', moduleId); }
}

/** Raised when one or more enabled module dependencies are unavailable. */
export class MissingDependenciesError extends PlatformRegistryError {
  constructor(moduleId: string, readonly missingDependencies: readonly string[]) {
    super(`Platform module "${moduleId}" requires missing or disabled dependencies: ${missingDependencies.join(', ')}.`, 'MISSING_DEPENDENCIES', moduleId);
  }
}

/** Raised when a module is sent to a registry for another category. */
export class InvalidModuleCategoryError extends PlatformRegistryError {
  constructor(moduleId: string, expected: string, actual: string) {
    super(`Platform module "${moduleId}" has category "${actual}"; expected "${expected}".`, 'INVALID_MODULE_CATEGORY', moduleId);
  }
}
