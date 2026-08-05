/** Constructor that can be used as a dependency-injection token. */
export type Constructor<T> = abstract new (...args: never[]) => T;

/** Stable identifier accepted by the service container. */
export type ServiceToken<T> = Constructor<T> | symbol | string;

/** Lifecycles supported by registered services. */
export type ServiceLifetime = 'singleton' | 'lazySingleton' | 'transient' | 'factory';

/** Factory used to construct a registered service. */
export type RegistryFactory<T> = (resolver: ServiceResolver) => T;

/** Minimal resolver exposed to factories to avoid coupling them to a container implementation. */
export interface ServiceResolver {
  resolve<T>(token: ServiceToken<T>): T;
}

/** Internal registration description retained by the registry. */
export interface ServiceRegistration<T = unknown> {
  readonly lifetime: ServiceLifetime;
  readonly factory: RegistryFactory<T>;
  instance?: T;
}

/** Stores service registrations independently from resolution behavior. */
export class ServiceRegistry {
  private readonly registrations = new Map<ServiceToken<unknown>, ServiceRegistration>();

  /** Adds or replaces a registration. */
  set<T>(token: ServiceToken<T>, registration: ServiceRegistration<T>): void {
    this.registrations.set(token, registration as ServiceRegistration);
  }

  /** Returns a registration when one exists. */
  get<T>(token: ServiceToken<T>): ServiceRegistration<T> | undefined {
    return this.registrations.get(token) as ServiceRegistration<T> | undefined;
  }

  /** Reports whether a token is registered. */
  has<T>(token: ServiceToken<T>): boolean { return this.registrations.has(token); }

  /** Removes a registration and its cached instance. */
  delete<T>(token: ServiceToken<T>): boolean { return this.registrations.delete(token); }

  /** Removes every service registration. */
  clear(): void { this.registrations.clear(); }

  /** Returns all currently registered tokens. */
  tokens(): readonly ServiceToken<unknown>[] { return [...this.registrations.keys()]; }
}
