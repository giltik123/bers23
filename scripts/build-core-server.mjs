import { cp, mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';

await rm('dist-server', { recursive: true, force: true });
await mkdir('dist-server/migrations', { recursive: true });
await build({ entryPoints: ['server/index.ts'], outfile: 'dist-server/server.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external', sourcemap: false });
await cp('server/transactions/infrastructure/postgres/migrations/001_transaction_store.sql', 'dist-server/migrations/001_transaction_store.sql');
await cp('server/core/artifacts/migrations/002_canonical_mask_artifacts.sql', 'dist-server/migrations/002_canonical_mask_artifacts.sql');
await cp('server/core/artifacts/migrations/003_canonical_final_image_artifacts.sql', 'dist-server/migrations/003_canonical_final_image_artifacts.sql');
await cp('server/core/projects/migrations/004_canonical_projects_and_originals.sql', 'dist-server/migrations/004_canonical_projects_and_originals.sql');
await cp('server/core/projects/migrations/005_canonical_project_history_versions.sql', 'dist-server/migrations/005_canonical_project_history_versions.sql');
await cp('server/core/projects/migrations/006_project_history_acceptance_hardening.sql', 'dist-server/migrations/006_project_history_acceptance_hardening.sql');
await cp('server/core/projects/migrations/007_project_history_source_lineage.sql', 'dist-server/migrations/007_project_history_source_lineage.sql');
await cp('server/core/auth/migrations/008_canonical_auth_identity_sessions.sql', 'dist-server/migrations/008_canonical_auth_identity_sessions.sql');
await cp('server/core/auth/migrations/009_auth_lifecycle_oauth.sql', 'dist-server/migrations/009_auth_lifecycle_oauth.sql');
await cp('server/core/auth/migrations/010_registration_attempt_binding.sql', 'dist-server/migrations/010_registration_attempt_binding.sql');
