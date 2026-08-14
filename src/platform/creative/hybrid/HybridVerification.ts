import { immutableClone } from './immutable';
import type { HybridArtifact, HybridExecutionEdge, Scope } from './types';
export type HybridVerificationResult = Readonly<{ valid: boolean; checks: Readonly<Record<string, boolean>>; errors: readonly string[] }>;
export class HybridVerification {
  async verify(artifact: HybridArtifact, expectedScope: Scope, hash: (value: unknown) => Promise<string>, edge?: HybridExecutionEdge): Promise<HybridVerificationResult> { const digest = await hash(artifact.value); const checks = { hash: Boolean(artifact.hash) && digest === artifact.hash, dimensions: artifact.width === undefined || artifact.height === undefined || artifact.width > 0 && artifact.height > 0, format: /^(image\/(png|jpeg|webp)|application\/json|text\/plain)$/.test(artifact.mimeType), alpha: artifact.alpha === undefined || typeof artifact.alpha === 'boolean', metadata: artifact.metadata !== null && typeof artifact.metadata === 'object', scope: sameScope(artifact.scope, expectedScope), boundary: !edge || edge.permitted }; const errors = Object.entries(checks).filter(([, valid]) => !valid).map(([name]) => `${name} verification failed`); return immutableClone({ valid: !errors.length, checks, errors }); }
}
const sameScope = (a: Scope, b: Scope) => a.tenantId === b.tenantId && a.projectId === b.projectId && a.userId === b.userId;
