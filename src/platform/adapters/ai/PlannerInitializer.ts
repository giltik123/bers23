import type { PlatformContext, PlatformInitializer } from '../../PlatformContext';

/** Registers Planner metadata without importing Planner business logic. */
export class PlannerInitializer implements PlatformInitializer {
  /** Adds Planner to AI module discovery. */
  register({ aiModules }: PlatformContext): void {
    aiModules.register({ id: 'planner', name: 'Planner', version: '1.0.0', author: 'Berserk', description: 'Intent analysis and executable edit planning.', category: 'ai-module', capabilities: ['planning', 'intent-analysis', 'execution-planning'], dependencies: ['image-pipeline'], enabled: true });
  }
}
