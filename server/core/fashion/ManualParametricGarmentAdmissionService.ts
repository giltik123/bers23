import type { GarmentOwnerScope } from './postgresGarmentStore.ts';
import type {
  ManualParametricContourAdmissionResult,
  PostgresGarmentRepresentationStore,
} from './postgresGarmentRepresentationStore.ts';

const COMMAND_KEYS = Object.freeze(['contour', 'expectedRevision', 'garmentId'] as const);

type ManualParametricAuthority = Pick<PostgresGarmentRepresentationStore, 'admitManualParametricContour'>;

export type ManualParametricGarmentAdmissionCommand = Readonly<{
  garmentId: string;
  expectedRevision: number;
  contour: unknown;
}>;

/**
 * Thin Core intent boundary for deterministic manual PARAMETRIC acquisition.
 *
 * The browser-facing intent contains no representation/source/provenance identity.
 * Current-primary binding, replay, revision linearization and immutable persistence
 * remain owned by PostgresGarmentRepresentationStore under one Garment row lock.
 */
export class ManualParametricGarmentAdmissionService {
  constructor(private readonly representations: ManualParametricAuthority) {}

  async admit(
    scope: GarmentOwnerScope,
    command: ManualParametricGarmentAdmissionCommand,
  ): Promise<ManualParametricContourAdmissionResult> {
    const normalized = normalizeCommand(command);
    return this.representations.admitManualParametricContour(
      scope,
      normalized.garmentId,
      normalized.expectedRevision,
      normalized.contour,
    );
  }
}

function normalizeCommand(command: ManualParametricGarmentAdmissionCommand): ManualParametricGarmentAdmissionCommand {
  if (!command || typeof command !== 'object' || Array.isArray(command)) {
    throw requestError('Manual PARAMETRIC admission request must be an object');
  }
  const actual = Object.keys(command as unknown as Record<string, unknown>).sort();
  const expected = [...COMMAND_KEYS].sort();
  if (actual.length !== expected.length || expected.some((key, index) => actual[index] !== key)) {
    throw Object.assign(new Error('Manual PARAMETRIC admission accepts garmentId, expectedRevision and contour only'), {
      status: 400,
      code: 'manual_parametric_forbidden_authority',
    });
  }
  return Object.freeze({
    garmentId: command.garmentId,
    expectedRevision: command.expectedRevision,
    contour: command.contour,
  });
}

function requestError(message: string): Error & { status: 400; code: 'invalid_manual_parametric_admission_request' } {
  return Object.assign(new Error(message), { status: 400 as const, code: 'invalid_manual_parametric_admission_request' as const });
}
