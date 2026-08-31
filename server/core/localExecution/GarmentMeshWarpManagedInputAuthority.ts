import type { LocalExecutionTicketV2 } from '../../../src/platform/creative/canonical/localExecution.ts';
import type { GarmentOwnerScope } from '../fashion/postgresGarmentStore.ts';
import type {
  ManagedGarmentLocalExecutionInputAuthority,
  RevalidatedManagedGarmentInput,
} from './ManagedGarmentLocalExecutionInputAuthority.ts';

export type GarmentMeshWarpManagedInputLimits = Readonly<{
  maxDimension: number;
  maxPixels: number;
}>;

type InnerAuthority = Pick<
  ManagedGarmentLocalExecutionInputAuthority,
  'bindView' | 'bindParametricRepresentation' | 'revalidateTicket'
>;

/** Capability-scoped guard around the generic managed-Garment authority. */
export class GarmentMeshWarpManagedInputAuthority {
  constructor(
    private readonly inner: InnerAuthority,
    private readonly limits: GarmentMeshWarpManagedInputLimits,
  ) {
    assertLimits(limits);
  }

  async bindView(scope: GarmentOwnerScope, garmentId: string, viewId: string) {
    const binding = await this.inner.bindView(scope, garmentId, viewId);
    assertViewWithinLimits(binding.width, binding.height, this.limits);
    return binding;
  }

  bindParametricRepresentation(scope: GarmentOwnerScope, garmentId: string, representationId: string) {
    return this.inner.bindParametricRepresentation(scope, garmentId, representationId);
  }

  async revalidateTicket(ticket: LocalExecutionTicketV2): Promise<readonly RevalidatedManagedGarmentInput[]> {
    const resolved = await this.inner.revalidateTicket(ticket);
    const view = resolved.find(value => value.binding.kind === 'GARMENT_VIEW');
    if (!view || view.binding.kind !== 'GARMENT_VIEW') {
      throw managedLimitError('Garment mesh-warp ticket has no canonical basis view');
    }
    assertViewWithinLimits(view.binding.width, view.binding.height, this.limits);
    return resolved;
  }
}

function assertLimits(limits: GarmentMeshWarpManagedInputLimits): void {
  if (!Number.isSafeInteger(limits.maxDimension) || limits.maxDimension < 1) throw new Error('Garment mesh-warp managed-input maxDimension is invalid');
  if (!Number.isSafeInteger(limits.maxPixels) || limits.maxPixels < 1) throw new Error('Garment mesh-warp managed-input maxPixels is invalid');
}

function assertViewWithinLimits(width: number, height: number, limits: GarmentMeshWarpManagedInputLimits): void {
  const pixels = width * height;
  if (
    !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width < 1
    || height < 1
    || width > limits.maxDimension
    || height > limits.maxDimension
    || !Number.isSafeInteger(pixels)
    || pixels > limits.maxPixels
  ) {
    throw managedLimitError('Managed Garment basis view exceeds garment mesh-warp source limits');
  }
}

function managedLimitError(message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), {
    name: 'GarmentMeshWarpManagedInputLimitError',
    status: 422,
    code: 'garment_mesh_warp_source_limit_exceeded',
  });
}
