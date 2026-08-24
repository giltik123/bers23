import type { AnyLocalExecutionTicket, CreativeArtifact } from '../../../src/platform/creative/canonical/index.ts';

export type LocalExecutionInputAdmissionReason = 'INPUTS_ADMITTED' | 'INPUT_MISSING' | 'INPUT_KIND_MISMATCH' | 'INPUT_ROLE_MISMATCH' | 'INPUT_HASH_MISSING' | 'INPUT_HASH_MISMATCH';
export type LocalExecutionInputAdmissionDecision =
  | Readonly<{ allowed: true; reasonCode: 'INPUTS_ADMITTED' }>
  | Readonly<{ allowed: false; reasonCode: Exclude<LocalExecutionInputAdmissionReason, 'INPUTS_ADMITTED'>; artifactId: string }>;

/** Re-check current canonical inputs against the immutable ticket immediately before result persistence. Executor identity is intentionally out of scope here. */
export function admitLocalExecutionInputs(ticket: AnyLocalExecutionTicket, artifacts: readonly CreativeArtifact[]): LocalExecutionInputAdmissionDecision {
  const byId = new Map(artifacts.map(artifact => [artifact.id, artifact]));
  for (const binding of ticket.inputs) {
    const artifact = byId.get(binding.artifactId);
    if (!artifact) return denied('INPUT_MISSING', binding.artifactId);
    if (artifact.kind !== binding.kind) return denied('INPUT_KIND_MISMATCH', binding.artifactId);
    if (binding.role !== undefined && artifact.role !== binding.role) return denied('INPUT_ROLE_MISMATCH', binding.artifactId);
    if (!binding.sha256) return denied('INPUT_HASH_MISSING', binding.artifactId);
    const current = artifactSha256(artifact);
    if (!current || current.toLowerCase() !== binding.sha256.toLowerCase()) return denied('INPUT_HASH_MISMATCH', binding.artifactId);
  }
  return Object.freeze({ allowed: true, reasonCode: 'INPUTS_ADMITTED' });
}

function artifactSha256(artifact: CreativeArtifact): string | undefined {
  const metadata = artifact.metadata as Readonly<Record<string, unknown>> | undefined;
  const value = artifact.value && typeof artifact.value === 'object' ? artifact.value as Readonly<Record<string, unknown>> : undefined;
  const candidate = metadata?.sha256 ?? metadata?.hash ?? value?.sha256 ?? value?.hash;
  return typeof candidate === 'string' && /^[a-f0-9]{64}$/i.test(candidate) ? candidate : undefined;
}
function denied(reasonCode: Exclude<LocalExecutionInputAdmissionReason, 'INPUTS_ADMITTED'>, artifactId: string): LocalExecutionInputAdmissionDecision {
  return Object.freeze({ allowed: false, reasonCode, artifactId });
}
