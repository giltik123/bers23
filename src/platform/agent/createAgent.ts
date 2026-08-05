import type { AIOrchestrator } from '../orchestrator';
import { Agent, type AgentOptions } from './Agent';

/** Creates an isolated Agent core wired to an injected AIOrchestrator. */
export function createAgent(orchestrator: AIOrchestrator, options: AgentOptions = {}): Agent { return new Agent(orchestrator, options); }
