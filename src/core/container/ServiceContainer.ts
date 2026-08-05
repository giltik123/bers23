import { ServiceFactory } from './ServiceFactory';
import {
  ServiceRegistry,
  type Constructor,
  type RegistryFactory,
  type ServiceResolver,
  type ServiceToken,
} from './ServiceRegistry';

/** Error raised when a token cannot be resolved or has a circular factory dependency. */
export class ServiceResolutionError extends Error {
  constructor(message: string) { super(message); this.name = 'ServiceResolutionError'; }
}

/** Independent dependency-injection container with explicit service lifecycles. */
export class ServiceContainer implements ServiceResolver {
  private readonly resolving = new Set<ServiceToken<unknown>>();

  constructor(private readonly registry = new ServiceRegistry()) {}

  /** Registers a prebuilt singleton instance. */
  registerSingleton<T>(token: ServiceToken<T>, instance: T): this;
  /** Registers a class as a singleton constructed on first resolution. */
  registerSingleton<T>(constructor: Constructor<T>): this;
  registerSingleton<T>(token: ServiceToken<T> | Constructor<T>, instance?: T): this {
    const factory = instance === undefined
      ? ServiceFactory.fromClass(token as Constructor<T>)
      : () => instance;
    this.registry.set(token, { lifetime: 'singleton', factory, instance });
    return this;
  }

  /** Registers a factory whose first result is cached lazily. */
  registerLazySingleton<T>(token: ServiceToken<T>, factory: RegistryFactory<T>): this {
    this.registry.set(token, { lifetime: 'lazySingleton', factory });
    return this;
  }

  /** Registers a class or factory that creates a value on every resolution. */
  registerTransient<T>(token: ServiceToken<T>, factory: RegistryFactory<T>): this;
  /** Registers a zero-dependency class that creates a value on every resolution. */
  registerTransient<T>(constructor: Constructor<T>): this;
  registerTransient<T>(token: ServiceToken<T>, factory?: RegistryFactory<T>): this {
    this.registry.set(token, { lifetime: 'transient', factory: factory ?? ServiceFactory.fromClass(token as Constructor<T>) });
    return this;
  }

  /** Registers a factory that creates a value on every resolution. */
  registerFactory<T>(token: ServiceToken<T>, factory: RegistryFactory<T>): this {
    this.registry.set(token, { lifetime: 'factory', factory });
    return this;
  }

  /** Resolves a service according to its registered lifecycle. */
  resolve<T>(token: ServiceToken<T>): T {
    const registration = this.registry.get(token);
    if (!registration) throw new ServiceResolutionError(`Service is not registered: ${String(token)}`);
    if ((registration.lifetime === 'singleton' || registration.lifetime === 'lazySingleton') && registration.instance !== undefined) {
      return registration.instance;
    }
    if (this.resolving.has(token)) throw new ServiceResolutionError(`Circular service resolution: ${String(token)}`);
    this.resolving.add(token);
    try {
      const instance = registration.factory(this);
      if (registration.lifetime === 'singleton' || registration.lifetime === 'lazySingleton') registration.instance = instance;
      return instance;
    } finally {
      this.resolving.delete(token);
    }
  }

  /** Reports whether a service token is registered. */
  has<T>(token: ServiceToken<T>): boolean { return this.registry.has(token); }

  /** Removes a service registration. */
  unregister<T>(token: ServiceToken<T>): boolean { return this.registry.delete(token); }

  /** Removes every registration from the container. */
  clear(): void { this.registry.clear(); }
}

/** Default composition root available to application bootstrap code. */
export const container = new ServiceContainer();
