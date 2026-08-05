export class GatewayError extends Error { constructor(message: string, readonly code: string) { super(message); this.name = this.constructor.name; } }
export class GatewayAuthorizationError extends GatewayError { constructor(message = 'Gateway authorization failed') { super(message, 'gateway_authorization'); } }
export class GatewayBudgetExceededError extends GatewayError { constructor(message = 'Gateway budget exceeded') { super(message, 'gateway_budget_exceeded'); } }
export class GatewayPolicyRejectedError extends GatewayError { constructor(message = 'Gateway policy rejected request') { super(message, 'gateway_policy_rejected'); } }
export class GatewayWorkflowError extends GatewayError { constructor(message = 'Gateway workflow failed') { super(message, 'gateway_workflow'); } }
export class GatewayExecutionError extends GatewayError { constructor(message = 'Gateway execution failed') { super(message, 'gateway_execution'); } }
export class GatewayCancelledError extends GatewayError { constructor(message = 'Gateway execution cancelled') { super(message, 'gateway_cancelled'); } }
