import type { Constructor, RegistryFactory, ServiceResolver } from './ServiceRegistry';

/** Creates container factories without owning service lifecycle state. */
export class ServiceFactory {
  /** Wraps a class constructor as a zero-dependency factory. */
  static fromClass<T>(constructor: Constructor<T>): RegistryFactory<T> {
    return () => new (constructor as new () => T)();
  }

  /** Preserves an explicitly supplied factory. */
  static from<T>(factory: (resolver: ServiceResolver) => T): RegistryFactory<T> { return factory; }
}
