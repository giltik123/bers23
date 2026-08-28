export const LOCAL_BACKGROUND_ISOLATION_COMPOSITE_INTENT = 'LOCAL_SEGMENT_BACKGROUND_ISOLATION_COMPOSITE' as const;

/**
 * Semantic capability identities for the first durable LOCAL_ONLY composite.
 * These constants grant no execution, model, persistence, billing, or device authority by themselves.
 */
export const LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES = Object.freeze({
  segment: 'local:mobilesam:segment:background-isolation-composite:v1',
  backgroundIsolation: 'local:tool:background-isolation:composite:v1',
  verify: 'internal:verify:image:background-isolation-composite:v1',
} as const);
