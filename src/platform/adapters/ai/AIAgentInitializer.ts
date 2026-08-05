import type { PlatformContext, PlatformInitializer } from '../../PlatformContext';

/** Registers AI Agent metadata without importing Agent business logic. */
export class AIAgentInitializer implements PlatformInitializer {
  /** Adds AI Agent to AI module discovery. */
  register({ aiModules }: PlatformContext): void {
    aiModules.register({ id: 'ai-agent', name: 'AI Agent', version: '1.0.0', author: 'Berserk', description: 'Multi-step task decomposition and automation.', category: 'ai-module', capabilities: ['task-decomposition', 'multi-step-execution', 'automation'], dependencies: ['planner', 'recipe-library'], enabled: true });
  }
}
