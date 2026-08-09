import { immutable } from "./immutable";
import type { DecisionDatasetRecord } from "./advancedTypes";

export interface DatasetScope { readonly userId: string; readonly tenantId: string; readonly projectId: string }
export class DecisionLearningDataset {
  private records: readonly DecisionDatasetRecord[] = immutable([]);
  add(record: DecisionDatasetRecord): DecisionDatasetRecord {
    const snapshot = immutable(structuredClone(record));
    this.records = immutable([...this.records, snapshot]);
    return snapshot;
  }
  list(scope: DatasetScope): readonly DecisionDatasetRecord[] {
    return immutable(this.records.filter((item) => item.userId === scope.userId && item.tenantId === scope.tenantId
      && item.projectId === scope.projectId).map((item) => structuredClone(item)));
  }
}
