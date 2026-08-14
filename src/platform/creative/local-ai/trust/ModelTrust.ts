import { immutableClone } from '../immutable';
import type { HashPort, ModelFormat, ModelManifest, RuntimeKind, SignaturePort, TrustResult } from '../types';
export type TrustPolicy = Readonly<{ publishers: readonly string[]; formats: readonly ModelFormat[]; runtimes: readonly RuntimeKind[]; licenses: readonly string[] }>;
export class ModelTrustRegistry {
  constructor(readonly policy: TrustPolicy) { this.policy = immutableClone(policy); }
  publisherAllowed(value: string): boolean { return this.policy.publishers.includes(value); }
}
export class ModelSignatureVerifier {
  constructor(private readonly verifier: SignaturePort) {}
  verify(manifest: ModelManifest, digest = manifest.sha256): Promise<boolean> { return this.verifier.verify(manifest.publisher, manifest.signature, digest); }
}
export class ModelManifestVerifier {
  constructor(private readonly trust: ModelTrustRegistry, private readonly signatures: ModelSignatureVerifier, private readonly hash: HashPort) {}
  async verify(manifest: ModelManifest, bytes?: Uint8Array): Promise<TrustResult> {
    const digest = bytes ? await this.hash.sha256(bytes) : manifest.sha256;
    const checks = {
      publisher: this.trust.publisherAllowed(manifest.publisher), signature: Boolean(manifest.signature) && await this.signatures.verify(manifest, digest),
      checksum: /^[a-f0-9]{64}$/i.test(manifest.sha256) && digest === manifest.sha256, version: /^\d+\.\d+\.\d+$/.test(manifest.version),
      format: this.trust.policy.formats.includes(manifest.modelFormat), runtime: this.trust.policy.runtimes.includes(manifest.runtime),
      license: this.trust.policy.licenses.includes(manifest.license), uri: /^https:\/\//.test(manifest.downloadUri),
      accelerator: manifest.supportedAccelerators.includes(manifest.runtime),
      resources: manifest.sizeBytes > 0 && manifest.requiredRam >= 0 && manifest.requiredVram >= 0 && manifest.estimatedLatency > 0,
      scores: [manifest.qualityScore, manifest.energyScore, manifest.stabilityScore].every((score) => score >= 0 && score <= 1),
    };
    const errors = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => `${name} verification failed`);
    return immutableClone({ trusted: errors.length === 0, checks, errors });
  }
}
