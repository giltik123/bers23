export type ExecutionMode = 'LEGACY' | 'SHADOW' | 'CORE';
export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';

declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

export interface RequestContext {
  readonly auth: { readonly subject: string; readonly roles: readonly string[] };
  readonly user: { readonly id: string };
  readonly tenant: { readonly id: string };
  readonly project: { readonly id: string };
}

export interface ApplicationServices {
  readonly auth: { context(): Promise<RequestContext> };
  readonly database: { health(): Promise<HealthStatus> };
  readonly billing: { health(): Promise<HealthStatus> };
  readonly creativeExecution: { health(): Promise<HealthStatus> };
  readonly workflow: { health(): Promise<HealthStatus> };
  readonly pipeline: { health(): Promise<HealthStatus> };
  readonly providerPlatform: { health(): Promise<HealthStatus> };
  readonly providerRuntime: { health(): Promise<HealthStatus> };
  readonly localAI: { health(): Promise<HealthStatus> };
  readonly observability: { health(): Promise<HealthStatus> };
}

export type CoreHealth = Readonly<Record<keyof Omit<ApplicationServices, 'auth'>, HealthStatus>>;

/** Production composition root. Concrete infrastructure is supplied only here. */
export class CreativeApplicationComposition {
  readonly mode: ExecutionMode;

  constructor(readonly services: ApplicationServices, mode = process.env.CORE_EXECUTION_ENABLED) {
    if (!mode || !['LEGACY', 'SHADOW', 'CORE'].includes(mode)) throw new Error('CORE_EXECUTION_ENABLED must be LEGACY, SHADOW, or CORE');
    this.mode = mode as ExecutionMode;
  }

  async health(): Promise<CoreHealth> {
    const entries = await Promise.all(Object.entries(this.services)
      .filter(([name]) => name !== 'auth')
      .map(async ([name, service]) => [name, await (service as { health(): Promise<HealthStatus> }).health()] as const));
    return Object.freeze(Object.fromEntries(entries)) as CoreHealth;
  }
}
