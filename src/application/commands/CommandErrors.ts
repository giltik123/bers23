export class CommandError extends Error { constructor(message: string, readonly code: string) { super(message); this.name = this.constructor.name; } }
export class CommandClarificationRequiredError extends CommandError { constructor(message = 'Command requires clarification') { super(message, 'command_clarification_required'); } }
export class CommandConfirmationRequiredError extends CommandError { constructor(message = 'Command requires confirmation') { super(message, 'command_confirmation_required'); } }
export class CommandValidationError extends CommandError { constructor(message = 'Command validation failed') { super(message, 'command_validation_failed'); } }
export class CommandPlanningError extends CommandError { constructor(message = 'Command planning failed') { super(message, 'command_planning_failed'); } }
