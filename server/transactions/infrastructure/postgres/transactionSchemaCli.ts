import { Pool } from 'pg';

import { checkTransactionSchema, migrateTransactionSchema } from './transactionSchemaMigrator.ts';
import { checkMaskArtifactSchema, migrateMaskArtifactSchema } from '../../../core/artifacts/maskArtifactSchema.ts';
import { checkImageArtifactSchema, migrateImageArtifactSchema } from '../../../core/artifacts/imageArtifactSchema.ts';
import { checkFinalImageLineageSchema, migrateFinalImageLineageSchema } from '../../../core/artifacts/finalImageLineageSchema.ts';
import { checkProjectSchema, migrateProjectSchema } from '../../../core/projects/projectSchema.ts';
import { checkAuthSchema, migrateAuthSchema } from '../../../core/auth/authSchema.ts';
import { checkLocalExecutionUploadSchema, migrateLocalExecutionUploadSchema } from '../../../core/artifacts/localExecutionUploadSchema.ts';
import { checkLocalExecutionLedgerSchema, migrateLocalExecutionLedgerSchema } from '../../../core/localExecution/localExecutionLedgerSchema.ts';
import { checkGarmentSchema, migrateGarmentSchema } from '../../../core/fashion/garmentSchema.ts';
import { checkProjectBodyAnchorSchema, migrateProjectBodyAnchorSchema } from '../../../core/fashion/bodyAnchorSchema.ts';
import { checkGarmentWarpLayerSchema, migrateGarmentWarpLayerSchema } from '../../../core/fashion/garmentWarpLayerSchema.ts';
import { checkGarmentTextureFinalLineageSchema, migrateGarmentTextureFinalLineageSchema } from '../../../core/fashion/garmentTextureFinalLineageSchema.ts';
import { checkGarmentAppearanceRefinementFinalLineageSchema, migrateGarmentAppearanceRefinementFinalLineageSchema } from '../../../core/fashion/garmentAppearanceRefinementFinalLineageSchema.ts';

const command = process.argv[2];
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({
  connectionString: databaseUrl,
  max: 1,
  application_name: `bers-transaction-schema-${command ?? 'unknown'}`,
});
try {
  if (command === 'migrate') {
    const result = await migrateTransactionSchema(pool);
    // 014_canonical_mask_lineage references canonical_image_artifacts, so the image base
    // schema must exist before the MASK migrator upgrades 002 with lineage constraints.
    await migrateImageArtifactSchema(pool);
    await migrateMaskArtifactSchema(pool);
    // FINAL lineage 018-021 is a base Artifact contract and must be present before
    // Fashion 030/032 additively extend its closed producer shape.
    await migrateFinalImageLineageSchema(pool);
    await migrateProjectSchema(pool);
    await migrateAuthSchema(pool);
    await migrateLocalExecutionUploadSchema(pool);
    await migrateLocalExecutionLedgerSchema(pool);
    await migrateGarmentSchema(pool);
    await migrateProjectBodyAnchorSchema(pool);
    await migrateGarmentWarpLayerSchema(pool);
    await migrateGarmentTextureFinalLineageSchema(pool);
    await migrateGarmentAppearanceRefinementFinalLineageSchema(pool);
    console.info(JSON.stringify({ scope: 'transaction_schema', version: result.version, status: result.status }));
  } else if (command === 'check') {
    await checkTransactionSchema(pool);
    await checkImageArtifactSchema(pool);
    await checkMaskArtifactSchema(pool);
    await checkFinalImageLineageSchema(pool);
    await checkProjectSchema(pool);
    await checkAuthSchema(pool);
    await checkLocalExecutionUploadSchema(pool);
    await checkLocalExecutionLedgerSchema(pool);
    await checkGarmentSchema(pool);
    await checkProjectBodyAnchorSchema(pool);
    await checkGarmentWarpLayerSchema(pool);
    await checkGarmentTextureFinalLineageSchema(pool);
    await checkGarmentAppearanceRefinementFinalLineageSchema(pool);
    console.info(JSON.stringify({ scope: 'transaction_schema', status: 'ready' }));
  } else {
    throw new Error('expected migrate or check command');
  }
} finally {
  await pool.end();
}
