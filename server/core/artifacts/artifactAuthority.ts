import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import { PostgresMaskArtifactStore } from './postgresMaskArtifactStore.ts';
import { SignedArtifactAuthority } from './signedArtifactAuthority.ts';

/** One authorization boundary for signed external originals and durable stored masks. */
export class ArtifactAuthority {
  readonly external: SignedArtifactAuthority; readonly masks: PostgresMaskArtifactStore;
  constructor(external: SignedArtifactAuthority, masks: PostgresMaskArtifactStore) { this.external = external; this.masks = masks; }
  async owns(scope: AuthenticatedScope & { projectId: string }, ids: readonly string[]): Promise<boolean> {
    try {
      for (const id of ids) {
        try { this.external.resolve(id, scope); continue; } catch { /* stored-mask references are checked below */ }
        const claim = this.external.resolveStoredMask(id, scope);
        if (!await this.masks.load(claim.storageId, scope)) return false;
      }
      return true;
    } catch { return false; }
  }
}
