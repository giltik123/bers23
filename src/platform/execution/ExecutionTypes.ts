/** Supported semantic node roles in an AI execution graph. */
export type ExecutionNodeType = 'analysis' | 'processing' | 'generation' | 'validation' | 'composition' | 'storage';
/** Planning-time node state. Runtime owns the later lifecycle transitions. */
export type ExecutionNodeStatus = 'pending' | 'ready' | 'blocked';
/** Condition that allows an execution edge to be traversed. */
export type ExecutionEdgeCondition = 'success' | 'failure' | 'always';
/** Lifecycle events shared with routing/execution audit adapters. */
export type ExecutionPlanEventType = 'planCreated' | 'planStarted' | 'planCompleted' | 'planFailed';
