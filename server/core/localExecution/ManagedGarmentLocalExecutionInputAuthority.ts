import { createHash } from 'node:crypto';
import type {
  LocalExecutionManagedGarmentFull3dRepresentationInputBinding,
  LocalExecutionManagedGarmentInputBinding,
  LocalExecutionManagedGarmentParametricRepresentationInputBinding,
  LocalExecutionManagedGarmentRepresentationInputBinding,
  LocalExecutionManagedGarmentViewInputBinding,
  LocalExecutionTicketV2,
} from '../../../src/platform/creative/canonical/localExecution.ts';
import type {
  GarmentOwnerScope,
  PostgresGarmentStore,
} from '../fashion/postgresGarmentStore.ts';
import type {
  ManagedGarmentRepresentation,
  PostgresGarmentRepresentationStore,
} from '../fashion/postgresGarmentRepresentationStore.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type GarmentReader = Pick<PostgresGarmentStore, 'get' | 'loadView'>;
type RepresentationReader = Pick<PostgresGarmentRepresentationStore, 'get' | 'loadPayload'>;

export type ManagedGarmentLocalExecutionInputAuthorityDependencies = Readonly<{
  garments: GarmentReader;
  representations: RepresentationReader;
}>;

export type RevalidatedManagedGarmentInput = Readonly<{
  binding: LocalExecutionManagedGarmentInputBinding;
  bytes: Uint8Array;
}>;

/**
 * Core-only bridge between durable local-execution tickets and managed Garment evidence.
 *
 * It does not read Project Artifacts, issue execution capabilities, choose providers, or
 * persist FINAL output. Bindings are minted from current server-owned Garment stores and
 * every consumption reloads the same identity and recomputes SHA-256 from canonical bytes.
 */
export class ManagedGarmentLocalExecutionInputAuthority {
  constructor(private readonly dependencies: ManagedGarmentLocalExecutionInputAuthorityDependencies) {}

  async bindView(
    scope: GarmentOwnerScope,
    garmentIdValue: string,
    viewIdValue: string,
  ): Promise<LocalExecutionManagedGarmentViewInputBinding> {
    return (await this.requireView(scope, garmentIdValue, viewIdValue)).binding;
  }

  async bindRepresentation(
    scope: GarmentOwnerScope,
    garmentIdValue: string,
    representationIdValue: string,
  ): Promise<LocalExecutionManagedGarmentRepresentationInputBinding> {
    return (await this.requireRepresentation(scope, garmentIdValue, representationIdValue)).binding;
  }

  async bindParametricRepresentation(
    scope: GarmentOwnerScope,
    garmentIdValue: string,
    representationIdValue: string,
  ): Promise<LocalExecutionManagedGarmentParametricRepresentationInputBinding> {
    const resolved = await this.requireRepresentation(scope, garmentIdValue, representationIdValue);
    if (resolved.binding.tier !== 'PARAMETRIC') {
      throw managedError('managed_garment_input_representation_not_parametric', 'F4b deterministic garment geometry requires a PARAMETRIC representation');
    }
    return resolved.binding;
  }

  async revalidateTicket(ticket: LocalExecutionTicketV2): Promise<readonly RevalidatedManagedGarmentInput[]> {
    if (ticket.version !== '2' || ticket.issuer !== 'CORE') {
      throw managedError('managed_garment_input_ticket_invalid', 'Managed Garment inputs require a Core-issued v2 local-execution ticket');
    }
    if (ticket.managedInputs === undefined) return Object.freeze([]);
    if (ticket.managedInputs.length < 1) {
      throw managedError('managed_garment_input_ticket_invalid', 'Managed Garment input namespace cannot be empty when present');
    }

    const owner = Object.freeze({ tenantId: ticket.scope.tenantId, userId: ticket.scope.userId });
    const resolved: RevalidatedManagedGarmentInput[] = [];
    for (const expected of ticket.managedInputs) {
      const current = expected.kind === 'GARMENT_VIEW'
        ? await this.requireView(owner, expected.garmentId, expected.viewId)
        : await this.requireRepresentation(owner, expected.garmentId, expected.representationId);
      if (canonicalJson(current.binding) !== canonicalJson(expected)) {
        throw managedError('managed_garment_input_authority_mismatch', 'Managed Garment evidence no longer matches the immutable ticket binding');
      }
      resolved.push(Object.freeze({ binding: current.binding, bytes: Uint8Array.from(current.bytes) }));
    }
    return Object.freeze(resolved);
  }

  private async requireView(
    scope: GarmentOwnerScope,
    garmentIdValue: string,
    viewIdValue: string,
  ): Promise<Readonly<{ binding: LocalExecutionManagedGarmentViewInputBinding; bytes: Uint8Array }>> {
    const garmentId = normalizeUuid(garmentIdValue);
    const viewId = normalizeUuid(viewIdValue);
    const garment = await this.dependencies.garments.get(scope, garmentId);
    if (!garment) throw unavailable();
    if (garment.status !== 'ACTIVE') throw stateMismatch('Managed Garment is not active');
    const view = garment.views.find(candidate => candidate.id.toLowerCase() === viewId);
    if (!view) throw unavailable();
    if (view.contentType !== 'image/png' || view.encoding !== 'PNG_RGBA8_LOSSLESS' || !Number.isSafeInteger(view.width) || !Number.isSafeInteger(view.height) || view.width < 1 || view.height < 1) {
      throw stateMismatch('Managed Garment view metadata is outside the admitted canonical contract');
    }
    const payload = await this.dependencies.garments.loadView(scope, garmentId, viewId);
    if (!payload) throw unavailable();
    const bytes = Uint8Array.from(payload.bytes);
    const digest = sha256(bytes);
    if (payload.contentType !== 'image/png' || digest !== payload.contentSha256 || digest !== view.contentSha256) {
      throw integrityMismatch('Managed Garment view bytes do not match canonical SHA-256 metadata');
    }
    return Object.freeze({
      binding: Object.freeze({
        authority: 'MANAGED_GARMENT',
        kind: 'GARMENT_VIEW',
        garmentId,
        viewId,
        contentSha256: digest,
        contentType: 'image/png',
        encoding: 'PNG_RGBA8_LOSSLESS',
        width: view.width,
        height: view.height,
      }),
      bytes,
    });
  }

  private async requireRepresentation(
    scope: GarmentOwnerScope,
    garmentIdValue: string,
    representationIdValue: string,
  ): Promise<Readonly<{ binding: LocalExecutionManagedGarmentRepresentationInputBinding; bytes: Uint8Array }>> {
    const garmentId = normalizeUuid(garmentIdValue);
    const representationId = normalizeUuid(representationIdValue);
    const garment = await this.dependencies.garments.get(scope, garmentId);
    if (!garment) throw unavailable();
    if (garment.status !== 'ACTIVE') throw stateMismatch('Managed Garment is not active');
    const representation = await this.dependencies.representations.get(scope, garmentId, representationId);
    if (!representation) throw unavailable();
    if (representation.admissionState !== 'ADMITTED') throw stateMismatch('Managed Garment representation is not admitted');
    if (!garment.views.some(view => view.id.toLowerCase() === representation.basisViewId.toLowerCase())) {
      throw stateMismatch('Managed Garment representation basis view is no longer current');
    }
    const payload = await this.dependencies.representations.loadPayload(scope, garmentId, representationId);
    if (!payload) throw unavailable();
    const bytes = Uint8Array.from(payload.bytes);
    const digest = sha256(bytes);
    if (digest !== payload.contentSha256 || digest !== representation.contentSha256 || payload.contentType !== representation.contentType) {
      throw integrityMismatch('Managed Garment representation bytes do not match canonical SHA-256 metadata');
    }
    return Object.freeze({ binding: representationBinding(representation, digest), bytes });
  }
}

function representationBinding(
  representation: ManagedGarmentRepresentation,
  contentSha256: string,
): LocalExecutionManagedGarmentRepresentationInputBinding {
  const common = {
    authority: 'MANAGED_GARMENT' as const,
    kind: 'GARMENT_REPRESENTATION' as const,
    garmentId: representation.garmentId.toLowerCase(),
    representationId: representation.id.toLowerCase(),
    contentSha256,
    basisViewId: representation.basisViewId.toLowerCase(),
    generatorId: representation.generatorId,
    generatorVersion: representation.generatorVersion,
    validatorId: representation.validatorId,
    validatorVersion: representation.validatorVersion,
  };
  if (representation.tier === 'PARAMETRIC') {
    if (representation.format !== 'BERS_PARAMETRIC_V1' || representation.contentType !== 'application/vnd.bers.garment-parametric+json') {
      throw stateMismatch('PARAMETRIC managed Garment representation format is invalid');
    }
    return Object.freeze({
      ...common,
      tier: 'PARAMETRIC',
      format: 'BERS_PARAMETRIC_V1',
      contentType: 'application/vnd.bers.garment-parametric+json',
    }) satisfies LocalExecutionManagedGarmentParametricRepresentationInputBinding;
  }
  if (representation.tier === 'FULL_3D') {
    if (representation.format !== 'GLB_2_0' || representation.contentType !== 'model/gltf-binary') {
      throw stateMismatch('FULL_3D managed Garment representation format is invalid');
    }
    return Object.freeze({
      ...common,
      tier: 'FULL_3D',
      format: 'GLB_2_0',
      contentType: 'model/gltf-binary',
    }) satisfies LocalExecutionManagedGarmentFull3dRepresentationInputBinding;
  }
  throw stateMismatch('Managed Garment representation tier is unsupported');
}

function normalizeUuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw unavailable();
  return value.toLowerCase();
}
function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
function canonicalJson(value: unknown): string { return JSON.stringify(canonicalValue(value)); }
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, canonicalValue(child)]));
}
function unavailable(): ManagedGarmentLocalExecutionInputError {
  return managedError('managed_garment_input_unavailable', 'Managed Garment input is unavailable in the authenticated owner scope');
}
function stateMismatch(message: string): ManagedGarmentLocalExecutionInputError {
  return managedError('managed_garment_input_state_mismatch', message);
}
function integrityMismatch(message: string): ManagedGarmentLocalExecutionInputError {
  return managedError('managed_garment_input_integrity_mismatch', message);
}
function managedError(code: string, message: string): ManagedGarmentLocalExecutionInputError {
  return new ManagedGarmentLocalExecutionInputError(code, message);
}

export class ManagedGarmentLocalExecutionInputError extends Error {
  readonly status = 409;
  constructor(readonly code: string, message: string) { super(message); this.name = 'ManagedGarmentLocalExecutionInputError'; }
}
