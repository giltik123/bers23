# Legacy workflow boundary

This package is a compatibility adapter for generic, pre-cutover workflows. It
may validate definitions, order steps, and delegate individual steps to its
injected orchestrator, but it is not the canonical authority for creative
planning or execution.

The Creative Workflow Engine, reached through `CreativeExecutionPlatform`, is
the sole canonical creative workflow authority. Legacy analytics, ranking,
recommendation, versioning, and experiments remain advisory utilities only;
they must not authorize or execute creative operations.

The former aggregate `WorkflowIntelligence` facade was removed because it
presented the advisory utilities as a second decision surface. Consumers that
still require legacy reporting may import the narrow advisory utility they
need while migrating to the canonical creative workflow path.
