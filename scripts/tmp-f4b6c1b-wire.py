from pathlib import Path


def replace_one(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one anchor, found {count}: {old!r}')
    target.write_text(text.replace(old, new, 1), encoding='utf-8')


replace_one(
    'server/core/http/manualParametricGarmentAdmissionHttpAdapter.ts',
    "    || representation.format !== 'BERS_PARAMETRIC_V1'\n    || representation.admissionState !== 'ADMITTED'\n    || value.representationTier === 'BASIC'\n",
    "    || representation.format !== 'BERS_PARAMETRIC_V1'\n    || representation.admissionState !== 'ADMITTED'\n",
)
replace_one(
    'server/core/http/manualParametricGarmentAdmissionHttpAdapter.ts',
    "  if (!Number.isSafeInteger(record.expectedRevision) || Number(record.expectedRevision) < 1) {\n    throw httpError(400, 'invalid_garment_revision', 'Expected Garment revision is invalid');\n  }\n  return Object.freeze({ expectedRevision: Number(record.expectedRevision), contour: record.contour });",
    "  const expectedRevision = record.expectedRevision;\n  if (typeof expectedRevision !== 'number' || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {\n    throw httpError(400, 'invalid_garment_revision', 'Expected Garment revision is invalid');\n  }\n  return Object.freeze({ expectedRevision, contour: record.contour });",
)

replace_one(
    'server/core/composition/createProductionCore.ts',
    "      projects: new PostgresProjectStore(transactions.pool),\n      auth,\n      localExecution: Object.freeze({",
    "      projects: new PostgresProjectStore(transactions.pool),\n      auth,\n      fashion: Object.freeze({\n        manualParametricAdmission: garmentMeshWarp.manualParametricAdmission,\n      }),\n      localExecution: Object.freeze({",
)

replace_one(
    'server/index.ts',
    "import { createFashionTryOnReadinessHttpAdapter } from './core/http/fashionTryOnReadinessHttpAdapter.ts';\n",
    "import { createFashionTryOnReadinessHttpAdapter } from './core/http/fashionTryOnReadinessHttpAdapter.ts';\nimport { createManualParametricGarmentAdmissionHttpAdapter } from './core/http/manualParametricGarmentAdmissionHttpAdapter.ts';\n",
)
replace_one(
    'server/index.ts',
    "  const fashionTryOnReadinessAdapter = createFashionTryOnReadinessHttpAdapter({ readiness: production.localExecution.garmentMeshWarp.readiness, auth: production.auth, config });\n",
    "  const fashionTryOnReadinessAdapter = createFashionTryOnReadinessHttpAdapter({ readiness: production.localExecution.garmentMeshWarp.readiness, auth: production.auth, config });\n  const manualParametricAdmissionAdapter = createManualParametricGarmentAdmissionHttpAdapter({ admission: production.fashion.manualParametricAdmission, auth: production.auth, config, accepting: () => accepting });\n",
)
replace_one(
    'server/index.ts',
    "    if (path === '/api/core/fashion/try-on/readiness') return void fashionTryOnReadinessAdapter(request, response);\n",
    "    if (path === '/api/core/fashion/try-on/readiness') return void fashionTryOnReadinessAdapter(request, response);\n    if (path.startsWith('/api/core/fashion/garments/') && path.endsWith('/parametric-representation')) return void manualParametricAdmissionAdapter(request, response);\n",
)

replace_one(
    'src/api/coreClient.js',
    "  fashion: {\n    checkTryOnReadiness: (payload) => request('/fashion/try-on/readiness', json('POST', payload)),\n  },",
    "  fashion: {\n    checkTryOnReadiness: (payload) => request('/fashion/try-on/readiness', json('POST', payload)),\n    admitManualParametricRepresentation: (garmentId, payload) => request(`/fashion/garments/${encodeURIComponent(garmentId)}/parametric-representation`, json('POST', payload)),\n  },",
)

composition = Path('server/core/composition/createProductionGarmentMeshWarp.ts').read_text(encoding='utf-8')
if 'new ManualParametricGarmentAdmissionService(representations)' not in composition:
    raise SystemExit('shared Fashion composition does not own the expected manual admission singleton')
if "Object.defineProperty(execution, 'manualParametricAdmission'" in composition:
    raise SystemExit('manual mutation authority must not be attached to the execution surface')

adapter = Path('server/core/http/manualParametricGarmentAdmissionHttpAdapter.ts').read_text(encoding='utf-8')
for forbidden in ('PostgresGarmentStore', 'PostgresGarmentRepresentationStore', 'FASHN', 'Billing'):
    if forbidden in adapter:
        raise SystemExit(f'HTTP adapter gained forbidden authority: {forbidden}')
