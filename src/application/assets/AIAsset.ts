export type AIAssetType = 'IMAGE' | 'MASK' | 'RESULT' | 'PREVIEW' | 'REFERENCE' | 'GARMENT';
export type AIAssetStatus = 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED' | 'ARCHIVED' | 'DELETED';

export interface AssetAccessContext { readonly tenantId: string; readonly projectId: string; readonly userId: string; }

export interface AssetLineageRecord {
  readonly assetId: string;
  readonly parentAssetId: string | null;
  readonly operation: string;
  readonly workflowId: string;
  readonly executionId: string;
  readonly createdAt: string;
}

export interface AssetVersionRecord extends AssetLineageRecord {
  readonly versionId: string;
}

export interface AIAsset {
  readonly id: string;
  readonly tenantId: string;
  readonly ownerId: string;
  readonly projectId: string;
  readonly sessionId: string;
  readonly type: AIAssetType;
  readonly status: AIAssetStatus;
  readonly source: unknown;
  readonly metadata: Record<string, unknown>;
  readonly versions: readonly AssetVersionRecord[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateAssetInput {
  readonly id?: string;
  readonly tenantId: string;
  readonly ownerId: string;
  readonly projectId: string;
  readonly sessionId: string;
  readonly type: AIAssetType;
  readonly source: unknown;
  readonly metadata?: Record<string, unknown>;
  readonly status?: AIAssetStatus;
}

export const createAssetId = () => `asset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
export const createVersionId = () => `asset_ver_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const clone = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value));
const freezeDeep = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) freezeDeep(item);
  }
  return value;
};

export const immutable = <T>(value: T): T => freezeDeep(clone(value));

export const assertAssetAccess = (asset: AIAsset, context: AssetAccessContext): void => {
  if (asset.tenantId !== context.tenantId) throw new Error('Tenant access denied for asset.');
  if (asset.projectId !== context.projectId) throw new Error('Project access denied for asset.');
  if (asset.ownerId !== context.userId) throw new Error('Owner access denied for asset.');
};
