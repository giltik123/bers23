import type { PlatformContext, PlatformInitializer } from './PlatformContext';

/** Runs injected self-registration hooks and validates the resulting platform graph. */
export class PlatformBootstrap {
  private started = false;
  constructor(private readonly context: PlatformContext, private readonly initializers: readonly PlatformInitializer[] = []) {}
  /** Registers all supplied modules once, then validates their dependencies. */
  async start(): Promise<PlatformContext> {
    if (this.started) return this.context;
    for (const initializer of this.initializers) await initializer.register(this.context);
    this.context.registry.validateDependencies();
    this.started = true;
    return this.context;
  }
}
