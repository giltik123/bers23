import {
  type HsmeTrainingHashPortV1,
  normalizeHsmeTeacherDecisionV1,
} from './HsmeTrainingProvenanceV1';
import {
  normalizeHsmeTeacherArtifactManifestV1,
} from './HsmeTeacherArtifactManifestV1';
import {
  type HsmeTeacherQualityAdmissionEvidenceV1,
  normalizeHsmeTeacherQualityBakeoffV1,
  proveHsmeTeacherQualityAdmissionV1,
} from './HsmeTeacherQualityEvidenceV1';
import {
  HSME_TEACHER_TRUST_ADMISSION_V1_SCHEMA,
  type HsmeTeacherTrustAdmissionEvidenceV1,
  normalizeHsmeTeacherLicenseReviewV1,
  normalizeHsmeTeacherToolchainV1,
  proveHsmeTeacherTrustAdmissionV1,
} from './HsmeTeacherTrustEvidenceV1';

export const HSME_TEACHER_ADMISSION_GATE_V1_SCHEMA = 'BERS_HSME_TEACHER_ADMISSION_GATE_V1' as const;

export type HsmeTeacherAdmissionGateEvidenceV1 = Readonly<{
  schemaVersion: typeof HSME_TEACHER_ADMISSION_GATE_V1_SCHEMA;
  trustEvidenceSchemaVersion: typeof HSME_TEACHER_TRUST_ADMISSION_V1_SCHEMA;
  selectedTeacherIds: readonly string[];
  qualityEvidence: HsmeTeacherQualityAdmissionEvidenceV1;
  trustEvidence: HsmeTeacherTrustAdmissionEvidenceV1;
}>;

export class HsmeTeacherAdmissionGateV1Error extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'HsmeTeacherAdmissionGateV1Error';
    this.code = code;
  }
}

export async function proveHsmeTeacherAdmissionGateV1(
  rawDecision: unknown,
  rawQualityBakeoff: unknown,
  rawManifests: readonly unknown[],
  rawLicenseReviews: readonly unknown[],
  rawToolchains: readonly unknown[],
  hashPort: HsmeTrainingHashPortV1,
): Promise<HsmeTeacherAdmissionGateEvidenceV1> {
  const decision = normalizeHsmeTeacherDecisionV1(rawDecision);
  if (decision.decisionStatus !== 'TEACHER_SET_ADMITTED' || decision.selectedCandidateIds.length < 1) {
    fail('hsme_teacher_admission_decision_not_admitted', 'canonical admission gate requires TEACHER_SET_ADMITTED');
  }

  const selectedTeacherIds = Object.freeze([...decision.selectedCandidateIds].sort(lexical));
  const qualityBakeoff = normalizeHsmeTeacherQualityBakeoffV1(rawQualityBakeoff);
  for (const candidate of decision.candidates) {
    const result = qualityBakeoff.candidateResults.find(value => value.teacherCandidateId === candidate.candidateId);
    if (!result) continue;
    if (!candidate.immutableRevision || !candidate.contentSha256) {
      fail('hsme_teacher_admission_bakeoff_candidate_unpinned', `${candidate.candidateId} must be immutably pinned before quality comparison`);
    }
    if (candidate.immutableRevision !== result.immutableRevision) {
      fail('hsme_teacher_admission_bakeoff_revision_mismatch', `${candidate.candidateId} quality bakeoff revision differs from the decision pin`);
    }
    if (candidate.contentSha256 !== result.modelContentSha256) {
      fail('hsme_teacher_admission_bakeoff_content_mismatch', `${candidate.candidateId} quality bakeoff content differs from the decision pin`);
    }
  }

  const qualityEvidence = proveHsmeTeacherQualityAdmissionV1(rawDecision, rawQualityBakeoff);
  if (!sameStrings(selectedTeacherIds, qualityEvidence.selectedTeacherIds)) {
    fail('hsme_teacher_admission_quality_set_mismatch', 'quality evidence selected teacher set changed during admission');
  }

  const manifestTeacherIds = exactTeacherIds(
    rawManifests,
    value => normalizeHsmeTeacherArtifactManifestV1(value).teacherCandidateId,
    'manifests',
  );
  const licenseTeacherIds = exactTeacherIds(
    rawLicenseReviews,
    value => normalizeHsmeTeacherLicenseReviewV1(value).teacherCandidateId,
    'licenseReviews',
  );
  const toolchainTeacherIds = exactTeacherIds(
    rawToolchains,
    value => normalizeHsmeTeacherToolchainV1(value).teacherCandidateId,
    'toolchains',
  );

  assertSameTeacherSet(selectedTeacherIds, manifestTeacherIds, 'manifests');
  assertSameTeacherSet(selectedTeacherIds, licenseTeacherIds, 'licenseReviews');
  assertSameTeacherSet(selectedTeacherIds, toolchainTeacherIds, 'toolchains');

  const trustEvidence = await proveHsmeTeacherTrustAdmissionV1(
    rawDecision,
    rawManifests,
    rawLicenseReviews,
    rawToolchains,
    hashPort,
  );
  if (!sameStrings(selectedTeacherIds, trustEvidence.selectedTeacherIds)) {
    fail('hsme_teacher_admission_trust_set_mismatch', 'trust evidence selected teacher set changed during admission');
  }

  return Object.freeze({
    schemaVersion: HSME_TEACHER_ADMISSION_GATE_V1_SCHEMA,
    trustEvidenceSchemaVersion: HSME_TEACHER_TRUST_ADMISSION_V1_SCHEMA,
    selectedTeacherIds,
    qualityEvidence,
    trustEvidence,
  });
}

function exactTeacherIds(
  values: readonly unknown[],
  extract: (value: unknown) => string,
  label: string,
): readonly string[] {
  if (!Array.isArray(values) || values.length < 1 || values.length > 12) {
    fail('hsme_teacher_admission_evidence_count_invalid', `${label} must contain 1..12 entries`);
  }
  const ids = values.map(extract);
  if (new Set(ids).size !== ids.length) {
    fail('hsme_teacher_admission_evidence_duplicate', `${label} contains duplicate teacher evidence`);
  }
  return Object.freeze([...ids].sort(lexical));
}

function assertSameTeacherSet(
  expected: readonly string[],
  actual: readonly string[],
  label: string,
): void {
  if (!sameStrings(expected, actual)) {
    fail('hsme_teacher_admission_evidence_set_mismatch', `${label} must exactly match selectedCandidateIds`);
  }
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function lexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(code: string, message: string): never {
  throw new HsmeTeacherAdmissionGateV1Error(code, message);
}
