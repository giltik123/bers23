import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Scope } from '../../../src/platform/creative/workflow-engine/types.ts';

export type LocalExecutionUpload = Readonly<{
  uploadId: string;
  ticketId: string;
  scope: Scope;
  kind: string;
  role?: string;
  mimeType: string;
  width?: number;
  height?: number;
  sizeBytes: number;
  sha256: string;
  bytes: Uint8Array;
  expiresAt: number;
}>;

export class PostgresLocalExecutionUploadStore {
  constructor(private readonly pool: Pool, private readonly nextId: () => string = randomUUID) {}

  async persist(input: Readonly<{ ticketId: string; scope: Scope; kind: string; role?: string; mimeType: string; width?: number; height?: number; bytes: Uint8Array; expiresAt: number; now: number }>): Promise<LocalExecutionUpload> {
    if (!input.ticketId || !input.scope.tenantId || !input.scope.userId || !input.scope.projectId) throw new Error('Local execution upload scope is incomplete');
    if (!input.bytes.byteLength) throw new Error('Local execution upload is empty');
    if (!Number.isFinite(input.expiresAt) || input.expiresAt <= input.now) throw new Error('Local execution upload ticket is expired');
    if (input.kind === 'mask') {
      if (!Number.isInteger(input.width) || !Number.isInteger(input.height) || Number(input.width) < 1 || Number(input.height) < 1) throw new Error('Local MASK upload dimensions are invalid');
      if (input.mimeType !== 'application/octet-stream') throw new Error('Local MASK upload must use application/octet-stream');
      if (input.bytes.byteLength !== Number(input.width) * Number(input.height)) throw new Error('Local MASK byte length must equal width * height');
    }
    const uploadId = this.nextId();
    const sha256 = createHash('sha256').update(input.bytes).digest('hex');
    await this.pool.query(`INSERT INTO local_execution_uploads
      (upload_id,ticket_id,tenant_id,user_id,project_id,kind,artifact_role,mime_type,width,height,size_bytes,sha256,payload,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [
      uploadId, input.ticketId, input.scope.tenantId, input.scope.userId, input.scope.projectId, input.kind, input.role ?? null,
      input.mimeType, input.width ?? null, input.height ?? null, input.bytes.byteLength, sha256, Buffer.from(input.bytes), new Date(input.expiresAt),
    ]);
    return freezeUpload({ uploadId, ticketId: input.ticketId, scope: input.scope, kind: input.kind, role: input.role, mimeType: input.mimeType, width: input.width, height: input.height, sizeBytes: input.bytes.byteLength, sha256, bytes: input.bytes, expiresAt: input.expiresAt });
  }

  async load(uploadId: string, ticketId: string, scope: Scope, now: number): Promise<LocalExecutionUpload | undefined> {
    const result = await this.pool.query(`SELECT upload_id,ticket_id,tenant_id,user_id,project_id,kind,artifact_role,mime_type,width,height,size_bytes,sha256,payload,expires_at
      FROM local_execution_uploads
      WHERE upload_id=$1 AND ticket_id=$2 AND tenant_id=$3 AND user_id=$4 AND project_id=$5
        AND consumed_at IS NULL AND expires_at > $6`, [uploadId, ticketId, scope.tenantId, scope.userId, scope.projectId, new Date(now)]);
    const row = result.rows[0];
    if (!row) return undefined;
    const bytes = new Uint8Array(row.payload);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== row.sha256 || bytes.byteLength !== Number(row.size_bytes)) throw new Error('Quarantined local upload integrity mismatch');
    return freezeUpload({ uploadId: row.upload_id, ticketId: row.ticket_id, scope: { tenantId: row.tenant_id, userId: row.user_id, projectId: row.project_id }, kind: row.kind, role: row.artifact_role ?? undefined, mimeType: row.mime_type, width: row.width ?? undefined, height: row.height ?? undefined, sizeBytes: Number(row.size_bytes), sha256: row.sha256, bytes, expiresAt: new Date(row.expires_at).getTime() });
  }

  async consume(uploadId: string, ticketId: string, scope: Scope, now: number): Promise<boolean> {
    const result = await this.pool.query(`UPDATE local_execution_uploads SET consumed_at=$6
      WHERE upload_id=$1 AND ticket_id=$2 AND tenant_id=$3 AND user_id=$4 AND project_id=$5
        AND consumed_at IS NULL AND expires_at > $6`, [uploadId, ticketId, scope.tenantId, scope.userId, scope.projectId, new Date(now)]);
    return Number(result.rowCount) === 1;
  }
}

function freezeUpload(value: LocalExecutionUpload): LocalExecutionUpload {
  return Object.freeze({ ...value, scope: Object.freeze({ ...value.scope }), bytes: Uint8Array.from(value.bytes) });
}
