import { immutable } from "./immutable";
import type { DecisionExperience } from "./types";

export interface ExperienceScope { readonly userId: string; readonly tenantId: string; readonly projectId: string }

export class DecisionExperienceStore {
  private records: readonly DecisionExperience[] = immutable([]);

  add(experience: DecisionExperience): DecisionExperience {
    const snapshot = immutable(structuredClone(experience));
    this.records = immutable([...this.records, snapshot]);
    return snapshot;
  }

  list(scope: ExperienceScope): readonly DecisionExperience[] {
    return immutable(this.records.filter(({ context }) => context.userId === scope.userId
      && context.tenantId === scope.tenantId && context.projectId === scope.projectId).map((entry) => structuredClone(entry)));
  }
}
