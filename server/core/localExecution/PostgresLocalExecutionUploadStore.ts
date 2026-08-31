import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Scope } from '../../../src/platform/creative/workflow-engine/types.ts';

export type LocalExecutionUpload = Readonly<{
  uploadId: string;
  ticketId: string;
  scope: Scope;
  kind: string;
  role: string;
  mimeType: string;
  width?: number;
  height?: number;
  sizeBytes: number;
  sha256: string;
  bytes: Uint8Array;
  expiresAt: number;
}>;

export class PostgresLocalExecutionUploadStore {
  private readonly pool: Pool;
  private readonly nextId: () => string;

  constructor(pool: Pool, nextId: () => string = randomUUID) {
    this.pool = pool;
    this.nextId = nextId;
  }

  async persist(input: Readonly<{ ticketId: string; scope: Scope; kind: string; role: string; mimeType: string; width?: number; height?: number; bytes: Uint8Array; expiresAt: number; now: number }>): Promise<LocalExecutionUpload> {
    if (!input.ticketId || !input.scope.tenantId || !input.scope.userId || !input.scope.projectId) throw new Error('Local execution upload scope is incomplete');
    if (!input.role?.trim()) throw new Error('Local execution upload role is required');
    if (!input.bytes.byteLength) throw new Error('Local execution upload is empty');
    if (!Number.isFinite(input.expiresAt) || input.expiresAt <= input.now) throw new Error('Local execution upload ticket is expired');
    if (input.kind === 'mask') {
      if (!Number.isInteger(input.width) || !Number.isInteger(input.height) || Number(input.width) < 1 || Number(input.height) < 1) throw new Error('Local MASK upload dimensions are invalid');
      if (input.mimeType !== 'application/octet-stream') throw new Error('Local MASK upload must use application/octet-stream');
      if (input.bytes.byteLength !== Number(input.width) * Number(input.height)) throw new Error('Local MASK byte length must equal width * height');
    }
    const uploadId = this.nextId();
    const sha256 = createHash('sha256').update(input.bytes).digest('hex');
    await this.pool.query('DELETE FROM local_execution_uploads WHERE expires_at <= $1', [new Date(input.now)]);
    const replaceableWorkingImage = input.kind === 'image' && input.role === 'WORKING';
    const conflictClause = replaceableWorkingImage
      ? `DO UPDATE SET
          upload_id=EXCLUDED.upload_id,
          mime_type=EXCLUDED.mime_type,
          width=EXCLUDED.width,
          height=EXCLUDED.height,
          size_bytes=EXCLUDED.size_bytes,
          sha256=EXCLUDED.sha256,
          payload=EXCLUDED.payload,
          expires_at=EXCLUDED.expires_at
        WHERE local_execution_uploads.consumed_at IS NULL
          AND local_execution_uploads.tenant_id=EXCLUDED.tenant_id
          AND local_execution_uploads.user_id=EXCLUDED.user_id
          AND local_execution_uploads.project_id=EXCLUDED.project_id`
      : 'DO UPDATE SET ticket_id=EXCLUDED.ticket_id';
    const result = await this.pool.query(`INSERT INTO local_execution_uploads
      (upload_id,ticket_id,tenant_id,user_id,project_id,kind,artifact_role,mime_type,width,height,size_bytes,sha256,payload,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (ticket_id,kind,artifact_role) ${conflictClause}
      RETURNING upload_id,ticket_id,tenant_id,user_id,project_id,kind,artifact_role,mime_type,width,height,size_bytes,sha256,payload,expires_at,consumed_at`, [
      uploadId, input.ticketId, input.scope.tenantId, input.scope.userId, input.scope.projectId, input.kind, input.role,
      input.mimeType, input.width ?? null, input.height ?? null, input.bytes.byteLength, sha256, Buffer.from(input.bytes), new Date(input.expiresAt),
    ]);
    const row = result.rows[0];
    if (!row) throw new Error('Local execution output has already been consumed or cannot be replaced in this scope');
    if (row.consumed_at !== null) throw new Error('Local execution output has already been consumed');
    const storedBytes = new Uint8Array(row.payload);
    const same = row.ticket_id === input.ticketId && row.tenant_id === input.scope.tenantId && row.user_id === input.scope.userId && row.project_id === input.scope.projectId &&
      row.kind === input.kind && row.artifact_role === input.role && row.mime_type === input.mimeType && (row.width ?? undefined) === input.width && (row.height ?? undefined) === input.height &&
      Number(row.size_bytes) === input.bytes.byteLength && row.sha256 === sha256 && storedBytes.byteLength === input.bytes.byteLength && createHash('sha256').update(storedBytes).digest('hex') === sha256 &&
      new Date(row.expires_at).getTime() === input.expiresAt;
    if (!same) throw new Error('Local execution upload retry does not match the existing quarantined output');
    return freezeUpload({ uploadId: row.upload_id, ticketId: row.ticket_id, scope: { tenantId: row.tenant_id, userId: row.user_id, projectId: row.project_id }, kind: row.kind, role: row.artifact_role, mimeType: row.mime_type, width: row.width ?? undefined, height: row.height ?? undefined, sizeBytes: Number(row.size_bytes), sha256: row.sha256, bytes: storedBytes, expiresAt: new Date(row.expires_at).getTime() });
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
    return freezeUpload({ uploadId: row.upload_id, ticketId: row.ticket_id, scope: { tenantId: row.tenant_id, userId: row.user_id, projectId: row.project_id }, kind: row.kind, role: row.artifact_role, mimeType: row.mime_type, width: row.width ?? undefined, height: row.height ?? undefined, sizeBytes: Number(row.size_bytes), sha256: row.sha256, bytes, expiresAt: new Date(row.expires_at).getTime() });
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
