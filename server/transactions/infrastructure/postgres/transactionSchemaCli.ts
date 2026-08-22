import { Pool } from 'pg';

import { checkTransactionSchema, migrateTransactionSchema } from './transactionSchemaMigrator.ts';
import { checkMaskArtifactSchema, migrateMaskArtifactSchema } from '../../../core/artifacts/maskArtifactSchema.ts';
import { checkImageArtifactSchema, migrateImageArtifactSchema } from '../../../core/artifacts/imageArtifactSchema.ts';
import { checkProjectSchema, migrateProjectSchema } from '../../../core/projects/projectSchema.ts';
import { checkAuthSchema, migrateAuthSchema } from '../../../core/auth/authSchema.ts';

const command = process.argv[2];
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: databaseUrl, max: 1,
  application_name: `bers-transaction-schema-${command ?? 'unknown'}` });
try {
  if (command === 'migrate') {
    const result = await migrateTransactionSchema(pool);
    await migrateMaskArtifactSchema(pool);
    await migrateImageArtifactSchema(pool);
    await migrateProjectSchema(pool);
    await migrateAuthSchema(pool);
    console.info(JSON.stringify({ scope: 'transaction_schema', version: result.version, status: result.status }));
  } else if (command === 'check') {
    await checkTransactionSchema(pool);
    await checkMaskArtifactSchema(pool);
    await checkImageArtifactSchema(pool);
    await checkProjectSchema(pool);
    await checkAuthSchema(pool);
    console.info(JSON.stringify({ scope: 'transaction_schema', status: 'ready' }));
  } else {
    throw new Error('expected migrate or check command');
  }
} finally {
  await pool.end();
}
