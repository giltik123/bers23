import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const FASHION_EXECUTION_PROFILES = Object.freeze({
  F4B2_MANAGED_INPUT: 'F4B2_MANAGED_INPUT',
  F4B3_BODY_ANCHOR: 'F4B3_BODY_ANCHOR',
  F4B4_WARP_ADMISSION: 'F4B4_WARP_ADMISSION',
  F4B4_WARP_LAYER: 'F4B4_WARP_LAYER',
  F4B4_POSTGRES_VERTICAL: 'F4B4_POSTGRES_VERTICAL',
  F4B5B_TEXTURE_POSTGRES_VERTICAL: 'F4B5B_TEXTURE_POSTGRES_VERTICAL',
});

export const RELEVANT_CLASSIFICATION = 'RELEVANT_FASHION_EXECUTION_ACCEPTANCE_REQUIRED';
export const NOT_APPLICABLE_CLASSIFICATION = 'NOT_APPLICABLE_NON_FASHION_EXECUTION_CHANGE';

// Accepted F4b.2/F4b.3 trust root. Keep byte-for-byte path semantics stable:
// the new F4b.4 leaves must not silently widen either existing profile.
const LEGACY_COMMON_EXACT_PATHS = new Set([
  '.github/workflows/fashion-execution-ci-policy.yml',
  'scripts/classify-fashion-execution-ci.mjs',
  'tests/fashion-execution-ci-relevance.test.mjs',
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  '.npmrc',
  'tsconfig.json',
  'server/tsconfig.json',
  'scripts/build-core-server.mjs',
  'server/transactions/infrastructure/postgres/transactionSchemaCli.ts',
  'server/transactions/infrastructure/postgres/transactionSchemaMigrator.ts',
  'server/transactions/infrastructure/postgres/migrations/001_transaction_store.sql',
  'server/core/artifacts/localExecutionUploadSchema.ts',
  'server/core/artifacts/migrations/012_local_execution_uploads.sql',
  'server/core/artifacts/migrations/013_local_execution_ticket_ledger.sql',
  'server/core/artifacts/migrations/016_local_execution_result_replay_binding.sql',
  'server/core/localExecution/localExecutionLedgerSchema.ts',
  'server/core/localExecution/ManagedGarmentLocalExecutionInputAuthority.ts',
  'src/platform/creative/canonical/localExecution.ts',
  'server/core/fashion/garmentSchema.ts',
  'server/core/fashion/garmentWardrobeSchema.ts',
  'server/core/fashion/garmentCollectionSchema.ts',
  'server/core/fashion/outfitSchema.ts',
  'server/core/fashion/garmentRepresentationSchema.ts',
  'server/core/fashion/postgresGarmentStore.ts',
  'server/core/fashion/postgresGarmentWardrobeStore.ts',
  'server/core/fashion/postgresGarmentRepresentationStore.ts',
  'server/core/fashion/glbExecutionSubsetValidator.ts',
  'server/core/fashion/manualParametricContour.ts',
  'src/platform/creative/deterministic/GarmentMeshWarp.ts',
  'src/platform/creative/deterministic/GarmentMeshWarpIdentity.js',
  'server/core/fashion/migrations/022_managed_garments_and_initial_views.sql',
  'server/core/fashion/migrations/023_managed_garment_wardrobe_metadata.sql',
  'server/core/fashion/migrations/024_managed_garment_collections.sql',
  'server/core/fashion/migrations/025_managed_outfits.sql',
  'server/core/fashion/migrations/026_managed_garment_representations.sql',
  'server/core/fashion/migrations/027_garment_representation_revocation_lifecycle.sql',
  'server/core/fashion/migrations/033_manual_parametric_basis_content_uniqueness.sql',
  'server/core/localExecution/productionLocalExecutorPolicy.ts',
  'server/core/providers/productionExecutionCapabilities.ts',
  'server/core/providers/productionExecutionRoute.ts',
  'server/core/providers/productionTargetSelection.ts',
  'src/platform/creative/deterministic/DeterministicToolRegistry.ts',
  'src/lib/tryon/tryonEngine.js',
]);

const F4B2_EXACT_PATHS = new Set([
  '.github/workflows/fashion-managed-garment-input-f4b2.yml',
  'server/core/localExecution/LocalExecutionAdmission.ts',
  'server/core/localExecution/LocalExecutionTicketAuthority.ts',
  'server/core/localExecution/LocalExecutionLedger.ts',
  'server/core/localExecution/PostgresLocalExecutionLedger.ts',
  'server/core/localExecution/localExecutionReplayDigest.ts',
  'server/core/localExecution/LocalExecutionInputAdmission.ts',
  'server/core/localExecution/LocalExecutionInputDeliveryService.ts',
  'server/core/localExecution/PostgresLocalExecutionLedgerV2.integration.test.mjs',
  'tests/managed-garment-local-execution-input-contract.test.ts',
  'tests/managed-garment-local-execution-boundary.test.ts',
  'tests/managed-garment-local-execution-input-postgres.test.ts',
]);

const F4B3_EXACT_PATHS = new Set([
  '.github/workflows/fashion-body-anchor-destination-mesh-f4b3.yml',
  'server/core/fashion/bodyAnchorSchema.ts',
  'server/core/fashion/bodyAnchorGeometry.ts',
  'server/core/fashion/postgresProjectBodyAnchorStore.ts',
  'server/core/fashion/migrations/028_project_body_anchor_sets.sql',
  'server/core/fashion/migrations/031_project_body_anchor_acquisition_sequence.sql',
  'server/core/fashion/migrations/035_project_body_anchor_idempotency.sql',
  'server/core/projects/projectSchema.ts',
  'server/core/projects/postgresProjectStore.ts',
  'server/core/projects/migrations/004_canonical_projects_and_originals.sql',
  'server/core/projects/migrations/005_canonical_project_history_versions.sql',
  'server/core/projects/migrations/006_project_history_acceptance_hardening.sql',
  'server/core/projects/migrations/007_project_history_source_lineage.sql',
  'server/core/artifacts/imageArtifactSchema.ts',
  'server/core/artifacts/postgresImageArtifactStore.ts',
  'server/core/artifacts/migrations/003_canonical_final_image_artifacts.sql',
  'server/core/artifacts/finalImageLineageSchema.ts',
  'server/core/artifacts/migrations/018_canonical_final_image_lineage.sql',
  'server/core/artifacts/migrations/019_canonical_crop_final_lineage.sql',
  'server/core/artifacts/migrations/020_canonical_resize_final_lineage.sql',
  'server/core/artifacts/migrations/021_canonical_orthogonal_transform_final_lineage.sql',
  'server/core/fashion/garmentTextureFinalLineage.ts',
  'server/core/fashion/garmentAppearanceRefinementFinalLineage.ts',
  'src/platform/creative/deterministic/GarmentTextureCompositeParameters.ts',
  'src/platform/creative/deterministic/GarmentTextureCompositeIdentity.js',
  'src/platform/creative/deterministic/GarmentAppearanceRefinementIdentity.js',
  'server/core/fashion/garmentTextureFinalLineageSchema.ts',
  'server/core/fashion/garmentAppearanceRefinementFinalLineageSchema.ts',
  'server/core/fashion/migrations/030_fashion_garment_texture_final_lineage.sql',
  'server/core/fashion/migrations/032_fashion_garment_refinement_final_lineage.sql',
  'tests/fashion-body-anchor-destination-mesh-postgres.test.ts',
  'tests/fashion-body-anchor-schema-postgres.test.ts',
]);

const F4B4_COMMON_EXACT_PATHS = new Set([
  '.github/workflows/fashion-execution-ci-policy.yml',
  'scripts/classify-fashion-execution-ci.mjs',
  'tests/fashion-f4b4-execution-ci-relevance.test.mjs',
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  '.npmrc',
  'tsconfig.json',
  'server/tsconfig.json',
  'scripts/build-core-server.mjs',
  'src/platform/creative/deterministic/GarmentMeshWarp.ts',
  'src/platform/creative/deterministic/GarmentMeshWarpIdentity.js',
  'src/platform/creative/deterministic/GarmentMeshWarpRegistryDefinition.js',
  'server/core/localExecution/productionGarmentMeshWarpExecutorPolicy.ts',
  'server/core/providers/productionGarmentMeshWarpExecutionPolicy.ts',
  // Source-read and shell-assertion dependencies of the accepted F4b.4 boundary.
  'src/platform/creative/deterministic/DeterministicToolRegistry.ts',
  'server/core/localExecution/productionLocalExecutorPolicy.ts',
  'server/core/providers/productionExecutionCapabilities.ts',
  'server/core/providers/productionExecutionRoute.ts',
  'server/core/providers/productionTargetSelection.ts',
  'src/lib/tryon/tryonEngine.js',
  'tests/deterministic-garment-mesh-warp-admission-boundary.test.ts',
]);

const F4B4_ADMISSION_EXACT_PATHS = new Set([
  '.github/workflows/fashion-garment-mesh-warp-admission-f4b4.yml',
  'src/application/local-execution/CoreAuthorizedGarmentMeshWarp.ts',
  'src/platform/creative/canonical/garmentMeshWarpInputEnvelope.ts',
  'src/platform/creative/super-resolution/SuperResolutionContract.ts',
  'src/platform/creative/deterministic/ResizeIdentity.js',
  'src/platform/creative/deterministic/OrthogonalTransformIdentity.js',
  'src/platform/creative/deterministic/DeterministicPng.ts',
  'src/platform/creative/pipeline/ControlledLocalEdit.ts',
  'server/core/artifacts/artifactAuthority.ts',
  'server/core/artifacts/signedArtifactAuthority.ts',
  'server/core/http/browserSessionCookie.ts',
  'server/core/localExecution/GarmentMeshWarpExecutionContract.ts',
  'server/core/localExecution/GarmentMeshWarpManagedInputAuthority.ts',
  'server/core/localExecution/GarmentMeshWarpInputDeliveryService.ts',
  'server/core/localExecution/LocalGarmentMeshWarpExecutionService.ts',
  'server/core/localExecution/LocalExecutionAdmission.ts',
  'server/core/localExecution/LocalExecutionTicketAuthority.ts',
  'server/core/localExecution/LocalExecutionLedger.ts',
  'server/core/localExecution/localExecutionReplayDigest.ts',
  'server/core/localExecution/ManagedGarmentLocalExecutionInputAuthority.ts',
  'server/core/providers/garmentMeshWarpWorkflowVerifier.ts',
  'server/core/http/garmentMeshWarpHttpAdapter.ts',
  'tests/local-execution-managed-input-platform.test.ts',
  'tests/garment-mesh-warp-managed-input-limits.test.ts',
  'tests/garment-mesh-warp-registry-contract.test.ts',
  'tests/garment-mesh-warp-planner-contract.test.ts',
  'tests/garment-mesh-warp-ticket-contract.test.ts',
  'tests/artifact-authority-stored-image-evidence.test.ts',
  'tests/garment-mesh-warp-input-delivery.test.ts',
  'tests/garment-mesh-warp-execution-service.test.ts',
  'tests/garment-mesh-warp-workflow-verifier.test.ts',
  'tests/garment-mesh-warp-browser-executor.test.ts',
  'tests/garment-mesh-warp-http-adapter.test.ts',
]);

// These cohesive canonical execution directories are runtime dependencies of
// CreativeExecutionPlatform. They are bounded foundations, not model/provider trees.
const F4B4_ADMISSION_PREFIXES = Object.freeze([
  'src/platform/creative/canonical/',
  'src/platform/creative/workflow-engine/',
  'src/platform/creative/authority/',
  'src/platform/creative/cost/',
  'src/platform/creative/operations/',
]);

const F4B4_LAYER_EXACT_PATHS = new Set([
  '.github/workflows/fashion-garment-warp-layer-f4b4.yml',
  'tests/fashion-garment-warp-layer-postgres.test.ts',
  'server/core/fashion/garmentWarpLayerSchema.ts',
  'server/core/fashion/postgresGarmentWarpLayerStore.ts',
  'server/core/fashion/migrations/029_fashion_garment_warp_layers.sql',
  'server/core/fashion/bodyAnchorSchema.ts',
  'server/core/fashion/bodyAnchorGeometry.ts',
  'server/core/fashion/postgresProjectBodyAnchorStore.ts',
  'server/core/fashion/migrations/028_project_body_anchor_sets.sql',
  'server/core/fashion/migrations/031_project_body_anchor_acquisition_sequence.sql',
  'server/core/fashion/migrations/035_project_body_anchor_idempotency.sql',
  'server/core/fashion/garmentSchema.ts',
  'server/core/fashion/garmentWardrobeSchema.ts',
  'server/core/fashion/garmentCollectionSchema.ts',
  'server/core/fashion/outfitSchema.ts',
  'server/core/fashion/garmentRepresentationSchema.ts',
  'server/core/fashion/postgresGarmentStore.ts',
  'server/core/fashion/postgresGarmentWardrobeStore.ts',
  'server/core/fashion/postgresGarmentRepresentationStore.ts',
  'server/core/fashion/glbExecutionSubsetValidator.ts',
  'server/core/fashion/manualParametricContour.ts',
  'server/core/fashion/garmentTextureFinalLineage.ts',
  'server/core/fashion/garmentAppearanceRefinementFinalLineage.ts',
  'server/core/fashion/migrations/022_managed_garments_and_initial_views.sql',
  'server/core/fashion/migrations/023_managed_garment_wardrobe_metadata.sql',
  'server/core/fashion/migrations/024_managed_garment_collections.sql',
  'server/core/fashion/migrations/026_managed_garment_representations.sql',
  'server/core/fashion/migrations/027_garment_representation_revocation_lifecycle.sql',
  'server/core/fashion/migrations/033_manual_parametric_basis_content_uniqueness.sql',
  'server/core/projects/projectSchema.ts',
  'server/core/projects/postgresProjectStore.ts',
  'server/core/projects/migrations/004_canonical_projects_and_originals.sql',
  'server/core/projects/migrations/005_canonical_project_history_versions.sql',
  'server/core/projects/migrations/006_project_history_acceptance_hardening.sql',
  'server/core/projects/migrations/007_project_history_source_lineage.sql',
  'server/core/artifacts/imageArtifactSchema.ts',
  'server/core/artifacts/maskArtifactSchema.ts',
  'server/core/artifacts/postgresImageArtifactStore.ts',
  'server/core/artifacts/finalImageLineageSchema.ts',
  'server/core/artifacts/migrations/003_canonical_final_image_artifacts.sql',
  'server/core/artifacts/migrations/018_canonical_final_image_lineage.sql',
  'server/core/artifacts/migrations/019_canonical_crop_final_lineage.sql',
  'server/core/artifacts/migrations/020_canonical_resize_final_lineage.sql',
  'server/core/artifacts/migrations/021_canonical_orthogonal_transform_final_lineage.sql',
  'server/core/localExecution/ManagedGarmentLocalExecutionInputAuthority.ts',
  'src/platform/creative/deterministic/GarmentAppearanceRefinementIdentity.js',
  'src/platform/creative/deterministic/GarmentTextureCompositeIdentity.js',
  'src/platform/creative/deterministic/GarmentTextureCompositeParameters.ts',
  'server/transactions/infrastructure/postgres/transactionSchemaCli.ts',
  'server/transactions/infrastructure/postgres/transactionSchemaMigrator.ts',
  'server/transactions/infrastructure/postgres/migrations/001_transaction_store.sql',
]);

let f4b4PostgresExactPaths;

function getF4b4PostgresExactPaths() {
  if (f4b4PostgresExactPaths) return f4b4PostgresExactPaths;
  const manifest = JSON.parse(fs.readFileSync(new URL('./f4b4-postgres-ci-closure.json', import.meta.url), 'utf8'));
  if (manifest?.version !== 1 || manifest?.profile !== FASHION_EXECUTION_PROFILES.F4B4_POSTGRES_VERTICAL) {
    throw new Error('Invalid F4b.4 PostgreSQL CI closure manifest identity');
  }
  const expectedCounts = Object.freeze({ bundleInputs: 192, migrationPaths: 36, supportPaths: 17 });
  for (const [key, expected] of Object.entries(expectedCounts)) {
    if (!Array.isArray(manifest[key]) || manifest[key].length !== expected) {
      throw new Error(`Invalid F4b.4 PostgreSQL CI closure ${key}: expected ${expected} exact paths`);
    }
  }
  const paths = [...manifest.bundleInputs, ...manifest.migrationPaths, ...manifest.supportPaths];
  if (new Set(paths).size !== paths.length) throw new Error('F4b.4 PostgreSQL CI closure contains duplicate paths');
  for (const path of paths) {
    if (typeof path !== 'string' || !path || path !== normalizeRepoPath(path) || /[*?\[\]]/.test(path)) {
      throw new Error(`Invalid F4b.4 PostgreSQL CI closure path: ${String(path)}`);
    }
  }
  if (manifest.migrationPaths.includes('server/core/fashion/migrations/032_fashion_garment_refinement_final_lineage.sql')) {
    throw new Error('F5 refinement migration 032 must not enter F4b.4 PostgreSQL CI authority');
  }
  f4b4PostgresExactPaths = new Set(paths);
  return f4b4PostgresExactPaths;
}

let f4b5bPostgresExactPaths;

function getF4b5bPostgresExactPaths() {
  if (f4b5bPostgresExactPaths) return f4b5bPostgresExactPaths;
  const manifest = JSON.parse(fs.readFileSync(new URL('./f4b5b-postgres-ci-closure.json', import.meta.url), 'utf8'));
  if (manifest?.version !== 1 || manifest?.profile !== FASHION_EXECUTION_PROFILES.F4B5B_TEXTURE_POSTGRES_VERTICAL) {
    throw new Error('Invalid F4b.5b PostgreSQL CI closure manifest identity');
  }
  const expectedCounts = Object.freeze({ bundleInputs: 81, migrationPaths: 27, supportPaths: 20 });
  for (const [key, expected] of Object.entries(expectedCounts)) {
    if (!Array.isArray(manifest[key]) || manifest[key].length !== expected) {
      throw new Error(`Invalid F4b.5b PostgreSQL CI closure ${key}: expected ${expected} exact paths`);
    }
  }
  const paths = [...manifest.bundleInputs, ...manifest.migrationPaths, ...manifest.supportPaths];
  if (new Set(paths).size !== paths.length) throw new Error('F4b.5b PostgreSQL CI closure contains duplicate paths');
  for (const path of paths) {
    if (typeof path !== 'string' || !path || path !== normalizeRepoPath(path) || /[*?\[\]]/.test(path)) {
      throw new Error(`Invalid F4b.5b PostgreSQL CI closure path: ${String(path)}`);
    }
  }
  for (const excluded of [
    'server/transactions/infrastructure/postgres/migrations/001_transaction_store.sql',
    'server/core/auth/migrations/008_canonical_auth_identity_sessions.sql',
    'server/core/auth/migrations/009_auth_lifecycle_oauth.sql',
    'server/core/auth/migrations/010_registration_attempt_binding.sql',
    'server/core/auth/migrations/011_auth_abuse_session_controls.sql',
    'server/core/artifacts/migrations/015_workflow_continuations.sql',
    'server/core/fashion/migrations/032_fashion_garment_refinement_final_lineage.sql',
    'server/core/execution/migrations/034_execution_run_registry.sql',
  ]) {
    if (manifest.migrationPaths.includes(excluded)) {
      throw new Error(`Unrelated migration entered F4b.5b PostgreSQL CI authority: ${excluded}`);
    }
  }
  f4b5bPostgresExactPaths = new Set(paths);
  return f4b5bPostgresExactPaths;
}

function normalizeRepoPath(value) {
  return String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function requireProfile(value) {
  if (Object.values(FASHION_EXECUTION_PROFILES).includes(value)) return value;
  throw new Error(`Unsupported Fashion execution classifier profile: ${value}`);
}

function matchesPrefix(path, prefixes) {
  return prefixes.some(prefix => path.startsWith(prefix));
}

export function isFashionExecutionCiRelevant(filePath, profile) {
  const normalized = normalizeRepoPath(filePath);
  if (!normalized) return false;
  const resolvedProfile = requireProfile(profile);

  if (resolvedProfile === FASHION_EXECUTION_PROFILES.F4B2_MANAGED_INPUT) {
    return LEGACY_COMMON_EXACT_PATHS.has(normalized) || F4B2_EXACT_PATHS.has(normalized);
  }
  if (resolvedProfile === FASHION_EXECUTION_PROFILES.F4B3_BODY_ANCHOR) {
    return LEGACY_COMMON_EXACT_PATHS.has(normalized) || F4B3_EXACT_PATHS.has(normalized);
  }
  if (resolvedProfile === FASHION_EXECUTION_PROFILES.F4B4_WARP_ADMISSION) {
    return F4B4_COMMON_EXACT_PATHS.has(normalized)
      || F4B4_ADMISSION_EXACT_PATHS.has(normalized)
      || matchesPrefix(normalized, F4B4_ADMISSION_PREFIXES);
  }
  if (resolvedProfile === FASHION_EXECUTION_PROFILES.F4B4_POSTGRES_VERTICAL) {
    return getF4b4PostgresExactPaths().has(normalized);
  }
  if (resolvedProfile === FASHION_EXECUTION_PROFILES.F4B5B_TEXTURE_POSTGRES_VERTICAL) {
    return getF4b5bPostgresExactPaths().has(normalized);
  }
  return F4B4_COMMON_EXACT_PATHS.has(normalized) || F4B4_LAYER_EXACT_PATHS.has(normalized);
}

export function classifyFashionExecutionCi(paths, profile) {
  const resolvedProfile = requireProfile(profile);
  const normalizedPaths = [...new Set(paths.map(normalizeRepoPath).filter(Boolean))];
  const matchedPaths = normalizedPaths.filter(path => isFashionExecutionCiRelevant(path, resolvedProfile));
  const relevant = matchedPaths.length > 0;
  return Object.freeze({
    profile: resolvedProfile,
    relevant,
    classification: relevant ? RELEVANT_CLASSIFICATION : NOT_APPLICABLE_CLASSIFICATION,
    changedPathCount: normalizedPaths.length,
    matchedPaths: Object.freeze(matchedPaths),
  });
}

function parseCli(argv) {
  const profileIndex = argv.indexOf('--profile');
  const githubOutputIndex = argv.indexOf('--github-output');
  const profile = profileIndex >= 0 ? argv[profileIndex + 1] : null;
  const githubOutput = githubOutputIndex >= 0 ? argv[githubOutputIndex + 1] : null;
  const stdin0 = argv.includes('--stdin0');
  if (!profile) throw new Error('--profile is required');
  if (githubOutputIndex >= 0 && !githubOutput) throw new Error('--github-output requires a path');
  if (!stdin0) throw new Error('Only --stdin0 input is supported; changed paths must be NUL-delimited');
  return { profile: requireProfile(profile), githubOutput };
}

function readNullDelimitedInput(input) {
  if (input.length === 0) return [];
  return input.toString('utf8').split('\0').filter(Boolean);
}

function writeGithubOutputs(outputPath, result) {
  if (!outputPath) return;
  fs.appendFileSync(outputPath, [
    `profile=${result.profile}`,
    `relevant=${result.relevant ? 'true' : 'false'}`,
    `classification=${result.classification}`,
    `matched_count=${result.matchedPaths.length}`,
    '',
  ].join('\n'), 'utf8');
}

const invokedAsCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedAsCli) {
  try {
    const { profile, githubOutput } = parseCli(process.argv.slice(2));
    const result = classifyFashionExecutionCi(readNullDelimitedInput(fs.readFileSync(0)), profile);
    writeGithubOutputs(githubOutput, result);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
