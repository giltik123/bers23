import type { GarmentOwnerScope } from './postgresGarmentStore.ts';
import type {
  ManualParametricGarmentAdmissionResult,
  PostgresGarmentRepresentationStore,
} from './postgresGarmentRepresentationStore.ts';

export type ManualParametricGarmentAdmissionCommand = Readonly<{
  garmentId: string;
  expectedRevision: number;
  contour: unknown;
}>;

/**
 * Intent-only Core service for manual PARAMETRIC acquisition.
 *
 * Browser/client authority stops at garmentId + expectedRevision + explicit contour.
 * Current primary-view identity, source SHA, representation identity, producer/validator
 * provenance, replay and revision mutation all remain inside the representation store's
 * single PostgreSQL transaction.
 */
export class ManualParametricGarmentAdmissionService {
  constructor(private readonly representations: Pick<PostgresGarmentRepresentationStore, 'admitManualParametricContour'>) {}

  async admit(
    scope: GarmentOwnerScope,
    command: ManualParametricGarmentAdmissionCommand,
  ): Promise<ManualParametricGarmentAdmissionResult> {
    return this.representations.admitManualParametricContour(
      scope,
      command?.garmentId,
      command?.expectedRevision,
      command?.contour,
    );
  }
}
