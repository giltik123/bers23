export class AgentError extends Error { constructor(message: string, readonly code = 'AGENT_ERROR') { super(message); this.name = 'AgentError'; } }
export class AgentSessionNotFoundError extends AgentError { constructor(sessionId: string) { super(`Agent session "${sessionId}" was not found.`, 'AGENT_SESSION_NOT_FOUND'); this.name = 'AgentSessionNotFoundError'; } }
export class AgentCancelledError extends AgentError { constructor(sessionId: string) { super(`Agent session "${sessionId}" was cancelled.`, 'AGENT_CANCELLED'); this.name = 'AgentCancelledError'; } }
