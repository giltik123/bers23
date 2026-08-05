import { AIOrchestrator, type AIOrchestratorServices } from './AIOrchestrator';

/** Creates an isolated AI Orchestrator from injected platform services. */
export function createOrchestrator(services: AIOrchestratorServices): AIOrchestrator { return new AIOrchestrator(services); }
