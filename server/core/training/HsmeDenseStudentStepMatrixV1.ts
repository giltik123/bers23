import {
  hsmeDenseStudentRepresentationEvidenceV1Digest,
  type HsmeDenseStudentRepresentationEvidenceV1,
} from './HsmeDenseStudentRepresentationV1.ts';
import type {
  HsmeDenseStudentTrainingHashPortV1,
} from './HsmeDenseStudentTrainingToolchainV1.ts';

export const HSME_DENSE_STUDENT_BENCHMARK_BINDING_V1_SCHEMA =
  'BERS_HSME_DENSE_STUDENT_BENCHMARK_BINDING_V1' as const;
export const CORE_HSME_DENSE_STUDENT_STEP_MATRIX_REQUEST_V1_SCHEMA =
  'BERS_CORE_HSME_DENSE_STUDENT_STEP_MATRIX_REQUEST_V1' as const;
export const CORE_HSME_DENSE_STUDENT_STEP_MATRIX_RESULT_V1_SCHEMA =
  'BERS_CORE_HSME_DENSE_STUDENT_STEP_MATRIX_RESULT_V1' as const;
export const HSME_DENSE_STUDENT_STEP_MATRIX_EVIDENCE_V1_SCHEMA =
  'BERS_HSME_DENSE_STUDENT_STEP_MATRIX_EVIDENCE_V1' as const;

export const HSME_DENSE_STUDENT_BENCHMARK_BINDING_DIGEST_DOMAIN =
  'bers:hsme:dense-student-benchmark-binding:v1\0' as const;
export const CORE_HSME_DENSE_STUDENT_STEP_MATRIX_RESULT_DIGEST_DOMAIN =
  'bers:core:hsme:dense-student-step-matrix-result:v1\0' as const;
export const HSME_DENSE_STUDENT_STEP_MATRIX_EVIDENCE_DIGEST_DOMAIN =
  'bers:hsme:dense-student-step-matrix-evidence:v1\0' as const;

export const HSME_DENSE_STUDENT_FIXED_STEP_COUNTS_V1 =
  Object.freeze([2,4,6,8] as const);
export const HSME_DENSE_STUDENT_FIXED_CAPABILITIES_V1 =
  Object.freeze(['IMAGE_EDITING','TEXT_TO_IMAGE'] as const);

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;
const MAX_SAMPLES_PER_ROW=4096;
const MAX_LATENCY_MICROS=3_600_000_000;
const MAX_MEMORY_BYTES=64*1024*1024*1024;
const MAX_BYTES_MOVED_PER_RUN=1024*1024*1024*1024;

type Capability=typeof HSME_DENSE_STUDENT_FIXED_CAPABILITIES_V1[number];
type StepCount=typeof HSME_DENSE_STUDENT_FIXED_STEP_COUNTS_V1[number];

export type HsmeDenseStudentBenchmarkCapabilityBindingV1=Readonly<{
  capability:Capability;
  dimensionIds:readonly string[];
}>;

export type HsmeDenseStudentBenchmarkBindingV1=Readonly<{
  schemaVersion:typeof HSME_DENSE_STUDENT_BENCHMARK_BINDING_V1_SCHEMA;
  fixturePlanSha256:string;
  fixtureSetSha256:string;
  blindedReviewRubricSha256:string;
  deterministicSeedContractSha256:string;
  requiredStepCounts:readonly [2,4,6,8];
  capabilities:readonly HsmeDenseStudentBenchmarkCapabilityBindingV1[];
  postObservationMutationAllowed:false;
  scheduleSelectionAllowed:false;
  candidateSelectionAllowed:false;
  winnerSelectionAllowed:false;
}>;

export interface HsmeDenseStudentBenchmarkBindingOriginVerifierV1{
  verifyBenchmarkBinding(
    binding:HsmeDenseStudentBenchmarkBindingV1,
    expectedBindingSha256:string,
  ):Promise<boolean>;
}

export type CoreHsmeDenseStudentStepMatrixRequestV1=Readonly<{
  schemaVersion:typeof CORE_HSME_DENSE_STUDENT_STEP_MATRIX_REQUEST_V1_SCHEMA;
  representationEvidenceSha256:string;
  candidateId:string;
  representationArtifactSha256:string;
  representationBytes:number;
  representationMetadataSha256:string;
  benchmarkBindingSha256:string;
  benchmarkBinding:HsmeDenseStudentBenchmarkBindingV1;
  measurementCeilings:Readonly<{
    maxSamplesPerRow:number;
    maxLatencyMicros:number;
    maxMemoryBytes:number;
    maxBytesMovedPerRun:number;
  }>;
  networkPolicy:'SEALED_INPUTS_ONLY';
  modelAcquisitionAllowed:false;
  providerSelectionAllowed:false;
  scheduleSelectionAllowed:false;
}>;

export type HsmeDenseStudentQualityDimensionMeasurementV1=Readonly<{
  dimensionId:string;
  lossMicrounits:number;
  criticalFailureObserved:boolean;
  evidenceSha256:string;
}>;

export type HsmeDenseStudentStepMeasurementRowV1=Readonly<{
  stepCount:StepCount;
  capability:Capability;
  outputSetSha256:string;
  sampleCount:number;
  successCount:number;
  failureCount:number;
  criticalFailureCount:number;
  qualityDimensions:readonly HsmeDenseStudentQualityDimensionMeasurementV1[];
  coldEndToEndLatencyMicros:number;
  warmEndToEndLatencyMicros:number;
  perStepLatencyMicros:number;
  peakRamBytes:number;
  peakAcceleratorBytes:number;
  activeRepresentationBytes:number;
  residentRepresentationBytes:number;
  flashBytesMovedPerRun:number;
  hardwareProfileSha256:string;
  runtimeIdentity:string;
  providerIdentity:string;
  measurementMethodSha256:string;
  measurementEvidenceSha256:string;
}>;

export type CoreHsmeDenseStudentStepMatrixResultV1=Readonly<{
  schemaVersion:typeof CORE_HSME_DENSE_STUDENT_STEP_MATRIX_RESULT_V1_SCHEMA;
  state:'STEP_MATRIX_MEASUREMENT_FAILED'|'STEP_MATRIX_MEASUREMENT_COMPLETED';
  representationEvidenceSha256:string;
  representationArtifactSha256:string;
  benchmarkBindingSha256:string;
  rows:readonly HsmeDenseStudentStepMeasurementRowV1[];
  stdoutEvidenceSha256:string;
  stderrEvidenceSha256:string;
  benchmarkAttemptId:string;
  benchmarkResultSha256:string;
}>;

export interface CoreHsmeDenseStudentStepMatrixPortV1{
  measureExactDenseStudentStepMatrix(
    request:CoreHsmeDenseStudentStepMatrixRequestV1,
  ):Promise<unknown>;
}

export interface CoreHsmeDenseStudentStepMatrixResultOriginVerifierV1{
  verifyStepMatrixResult(
    result:CoreHsmeDenseStudentStepMatrixResultV1,
    expectedBenchmarkResultSha256:string,
  ):Promise<boolean>;
}

export type HsmeDenseStudentStepMatrixEvidenceV1=Readonly<{
  schemaVersion:typeof HSME_DENSE_STUDENT_STEP_MATRIX_EVIDENCE_V1_SCHEMA;
  state:
    | 'STEP_MATRIX_INVALID'
    | 'STEP_MATRIX_BLOCKED'
    | 'STEP_MATRIX_MEASUREMENT_FAILED'
    | 'STEP_MATRIX_READY_NOT_SELECTED';
  blockers:readonly string[];
  representationEvidenceSha256:string|'UNKNOWN';
  candidateId:string|'UNKNOWN';
  representationArtifactSha256:string|'UNKNOWN';
  representationBytes:number|'UNKNOWN';
  benchmarkBindingSha256:string|'UNKNOWN';
  benchmarkResultSha256:string|'UNKNOWN';
  benchmarkAttemptId:string|'UNKNOWN';
  rows:readonly HsmeDenseStudentStepMeasurementRowV1[];
  evidenceSha256:string|'UNKNOWN';
  weightedAggregateScoreAllowed:false;
  efficiencyMayOverrideQualityFailure:false;
  scheduleSelectionAllowed:false;
  candidateSelectionAllowed:false;
  checkpointPromotionAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export class HsmeDenseStudentStepMatrixV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeDenseStudentStepMatrixV1Error';
    this.code=code;
  }
}

export async function proveHsmeDenseStudentStepMatrixV1(
  representation:HsmeDenseStudentRepresentationEvidenceV1,
  rawBinding:unknown,
  expectedBindingSha256:string,
  bindingOrigin:HsmeDenseStudentBenchmarkBindingOriginVerifierV1,
  benchmarker:CoreHsmeDenseStudentStepMatrixPortV1,
  resultOrigin:CoreHsmeDenseStudentStepMatrixResultOriginVerifierV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<HsmeDenseStudentStepMatrixEvidenceV1>{
  if(
    representation.state!=='REPRESENTATION_READY_NOT_ADMITTED'
    ||representation.blockers.length!==0
  ){
    return blocked(['STEP_MATRIX_READY_REPRESENTATION_REQUIRED']);
  }
  if(representationAuthorityWidened(representation)){
    return invalid(['STEP_MATRIX_REPRESENTATION_AUTHORITY_WIDENING']);
  }
  if(
    representation.candidateId!=='bers-dense-core-v1-training-target'
    ||representation.architectureFamily!=='COMPACT_DIT'
    ||representation.representationArtifactSha256==='UNKNOWN'
    ||representation.representationBytes==='UNKNOWN'
    ||representation.representationMetadataSha256==='UNKNOWN'
  ){
    return invalid(['STEP_MATRIX_REPRESENTATION_IDENTITY_INVALID']);
  }

  let representationEvidenceSha256:string;
  try{
    representationEvidenceSha256=
      await hsmeDenseStudentRepresentationEvidenceV1Digest(
        representation,
        hash,
      );
  }catch{
    return invalid(['STEP_MATRIX_REPRESENTATION_REHASH_INVALID']);
  }
  if(representationEvidenceSha256!==representation.evidenceSha256){
    return invalid(['STEP_MATRIX_REPRESENTATION_REHASH_MISMATCH'],{
      representationEvidenceSha256,
      candidateId:representation.candidateId,
      representationArtifactSha256:representation.representationArtifactSha256,
      representationBytes:representation.representationBytes,
    });
  }

  let binding:HsmeDenseStudentBenchmarkBindingV1;
  try{
    binding=normalizeHsmeDenseStudentBenchmarkBindingV1(rawBinding);
  }catch(error){
    return invalid([
      'STEP_MATRIX_BINDING_INVALID'+errorCodeSuffix(error),
    ],{
      representationEvidenceSha256,
      candidateId:representation.candidateId,
      representationArtifactSha256:representation.representationArtifactSha256,
      representationBytes:representation.representationBytes,
    });
  }
  if(!HEX64.test(expectedBindingSha256)){
    return invalid(['STEP_MATRIX_EXPECTED_BINDING_DIGEST_INVALID'],{
      representationEvidenceSha256,
      candidateId:representation.candidateId,
      representationArtifactSha256:representation.representationArtifactSha256,
      representationBytes:representation.representationBytes,
    });
  }

  const benchmarkBindingSha256=await hsmeDenseStudentBenchmarkBindingV1Digest(
    binding,
    hash,
  );
  if(benchmarkBindingSha256!==expectedBindingSha256){
    return invalid(['STEP_MATRIX_BINDING_REHASH_MISMATCH'],{
      representationEvidenceSha256,
      candidateId:representation.candidateId,
      representationArtifactSha256:representation.representationArtifactSha256,
      representationBytes:representation.representationBytes,
      benchmarkBindingSha256,
    });
  }
  if(!await verify(
    ()=>bindingOrigin.verifyBenchmarkBinding(binding,benchmarkBindingSha256),
  )){
    return invalid(['STEP_MATRIX_BINDING_ORIGIN_UNVERIFIED'],{
      representationEvidenceSha256,
      candidateId:representation.candidateId,
      representationArtifactSha256:representation.representationArtifactSha256,
      representationBytes:representation.representationBytes,
      benchmarkBindingSha256,
    });
  }

  const common={
    representationEvidenceSha256,
    candidateId:representation.candidateId,
    representationArtifactSha256:representation.representationArtifactSha256,
    representationBytes:representation.representationBytes,
    benchmarkBindingSha256,
  };
  const request=buildRequest(representation,binding,benchmarkBindingSha256);

  let rawResult:unknown;
  try{
    rawResult=await benchmarker.measureExactDenseStudentStepMatrix(request);
  }catch{
    return measurementFailed(['STEP_MATRIX_PROTECTED_BENCHMARKER_FAILED'],common);
  }

  let result:CoreHsmeDenseStudentStepMatrixResultV1;
  try{
    result=normalizeStepMatrixResult(rawResult,binding,request);
  }catch(error){
    return invalid([
      'STEP_MATRIX_RESULT_INVALID'+errorCodeSuffix(error),
    ],common);
  }

  const benchmarkResultSha256=
    await coreHsmeDenseStudentStepMatrixResultV1Digest(
      result,
      binding,
      request,
      hash,
    );
  if(benchmarkResultSha256!==result.benchmarkResultSha256){
    return invalid(['STEP_MATRIX_RESULT_REHASH_MISMATCH'],{
      ...common,
      benchmarkResultSha256,
      benchmarkAttemptId:result.benchmarkAttemptId,
    });
  }
  if(!await verify(
    ()=>resultOrigin.verifyStepMatrixResult(result,benchmarkResultSha256),
  )){
    return invalid(['STEP_MATRIX_RESULT_ORIGIN_UNVERIFIED'],{
      ...common,
      benchmarkResultSha256,
      benchmarkAttemptId:result.benchmarkAttemptId,
    });
  }

  if(result.state==='STEP_MATRIX_MEASUREMENT_FAILED'){
    if(result.rows.length!==0){
      return invalid(['STEP_MATRIX_FAILED_RESULT_ROWS_FORBIDDEN'],{
        ...common,
        benchmarkResultSha256,
        benchmarkAttemptId:result.benchmarkAttemptId,
      });
    }
    return measurementFailed(['STEP_MATRIX_MEASUREMENT_FAILED'],{
      ...common,
      benchmarkResultSha256,
      benchmarkAttemptId:result.benchmarkAttemptId,
    });
  }

  const readyPayload={
    schemaVersion:HSME_DENSE_STUDENT_STEP_MATRIX_EVIDENCE_V1_SCHEMA,
    state:'STEP_MATRIX_READY_NOT_SELECTED' as const,
    blockers:Object.freeze([]) as readonly string[],
    ...common,
    benchmarkResultSha256,
    benchmarkAttemptId:result.benchmarkAttemptId,
    rows:result.rows,
    ...authorityBoundary(),
  };
  const evidenceSha256=await digest(
    HSME_DENSE_STUDENT_STEP_MATRIX_EVIDENCE_DIGEST_DOMAIN,
    readyPayload,
    hash,
  );
  return deepFreeze({...readyPayload,evidenceSha256});
}

export function normalizeHsmeDenseStudentBenchmarkBindingV1(
  raw:unknown,
):HsmeDenseStudentBenchmarkBindingV1{
  const record=exactRecord(raw,[
    'schemaVersion',
    'fixturePlanSha256',
    'fixtureSetSha256',
    'blindedReviewRubricSha256',
    'deterministicSeedContractSha256',
    'requiredStepCounts',
    'capabilities',
    'postObservationMutationAllowed',
    'scheduleSelectionAllowed',
    'candidateSelectionAllowed',
    'winnerSelectionAllowed',
  ],'benchmarkBinding');
  if(record.schemaVersion!==HSME_DENSE_STUDENT_BENCHMARK_BINDING_V1_SCHEMA){
    fail('hsme_step_matrix_binding_schema','benchmark binding schema unsupported');
  }
  if(
    record.postObservationMutationAllowed!==false
    ||record.scheduleSelectionAllowed!==false
    ||record.candidateSelectionAllowed!==false
    ||record.winnerSelectionAllowed!==false
  ){
    fail('hsme_step_matrix_binding_authority','benchmark binding authority must remain false');
  }
  if(
    !Array.isArray(record.requiredStepCounts)
    ||record.requiredStepCounts.length!==4
    ||record.requiredStepCounts.some(
      (value,index)=>value!==HSME_DENSE_STUDENT_FIXED_STEP_COUNTS_V1[index],
    )
  ){
    fail('hsme_step_matrix_binding_steps','requiredStepCounts must equal [2,4,6,8]');
  }
  if(!Array.isArray(record.capabilities)||record.capabilities.length!==2){
    fail('hsme_step_matrix_binding_capabilities','exactly two capabilities are required');
  }
  const capabilities=record.capabilities.map((rawCapability,index)=>{
    const value=exactRecord(rawCapability,[
      'capability','dimensionIds',
    ],'benchmarkBinding.capabilities['+index+']');
    const capability=enumValue(
      value.capability,
      HSME_DENSE_STUDENT_FIXED_CAPABILITIES_V1,
      'benchmarkBinding.capabilities['+index+'].capability',
    );
    if(
      !Array.isArray(value.dimensionIds)
      ||value.dimensionIds.length<1
      ||value.dimensionIds.length>16
    ){
      fail(
        'hsme_step_matrix_binding_dimensions',
        'capability dimensionIds must contain 1..16 ids',
      );
    }
    const dimensionIds=value.dimensionIds.map((id,dimensionIndex)=>
      identifier(
        id,
        'benchmarkBinding.capabilities['+index+'].dimensionIds['+dimensionIndex+']',
        120,
      )
    );
    if(new Set(dimensionIds).size!==dimensionIds.length){
      fail('hsme_step_matrix_binding_dimensions','dimensionIds must be unique');
    }
    return Object.freeze({
      capability,
      dimensionIds:Object.freeze([...dimensionIds].sort(lexical)),
    });
  }).sort((a,b)=>lexical(a.capability,b.capability));
  if(
    capabilities[0].capability!=='IMAGE_EDITING'
    ||capabilities[1].capability!=='TEXT_TO_IMAGE'
  ){
    fail(
      'hsme_step_matrix_binding_capabilities',
      'capabilities must exactly cover IMAGE_EDITING and TEXT_TO_IMAGE',
    );
  }
  return deepFreeze({
    schemaVersion:HSME_DENSE_STUDENT_BENCHMARK_BINDING_V1_SCHEMA,
    fixturePlanSha256:sha256(record.fixturePlanSha256,'benchmarkBinding.fixturePlanSha256'),
    fixtureSetSha256:sha256(record.fixtureSetSha256,'benchmarkBinding.fixtureSetSha256'),
    blindedReviewRubricSha256:sha256(
      record.blindedReviewRubricSha256,
      'benchmarkBinding.blindedReviewRubricSha256',
    ),
    deterministicSeedContractSha256:sha256(
      record.deterministicSeedContractSha256,
      'benchmarkBinding.deterministicSeedContractSha256',
    ),
    requiredStepCounts:HSME_DENSE_STUDENT_FIXED_STEP_COUNTS_V1,
    capabilities:Object.freeze(capabilities),
    postObservationMutationAllowed:false,
    scheduleSelectionAllowed:false,
    candidateSelectionAllowed:false,
    winnerSelectionAllowed:false,
  });
}

export async function hsmeDenseStudentBenchmarkBindingV1Digest(
  binding:HsmeDenseStudentBenchmarkBindingV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  const normalized=normalizeHsmeDenseStudentBenchmarkBindingV1(binding);
  return digest(
    HSME_DENSE_STUDENT_BENCHMARK_BINDING_DIGEST_DOMAIN,
    normalized,
    hash,
  );
}

export async function coreHsmeDenseStudentStepMatrixResultV1Digest(
  result:CoreHsmeDenseStudentStepMatrixResultV1,
  binding:HsmeDenseStudentBenchmarkBindingV1,
  request:CoreHsmeDenseStudentStepMatrixRequestV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  const normalized=normalizeStepMatrixResult(result,binding,request);
  return digest(
    CORE_HSME_DENSE_STUDENT_STEP_MATRIX_RESULT_DIGEST_DOMAIN,
    resultPayload(normalized),
    hash,
  );
}

function buildRequest(
  representation:HsmeDenseStudentRepresentationEvidenceV1,
  binding:HsmeDenseStudentBenchmarkBindingV1,
  benchmarkBindingSha256:string,
):CoreHsmeDenseStudentStepMatrixRequestV1{
  if(
    representation.evidenceSha256==='UNKNOWN'
    ||representation.candidateId==='UNKNOWN'
    ||representation.representationArtifactSha256==='UNKNOWN'
    ||representation.representationBytes==='UNKNOWN'
    ||representation.representationMetadataSha256==='UNKNOWN'
  ){
    fail('hsme_step_matrix_representation_unresolved','representation identity is incomplete');
  }
  return deepFreeze({
    schemaVersion:CORE_HSME_DENSE_STUDENT_STEP_MATRIX_REQUEST_V1_SCHEMA,
    representationEvidenceSha256:representation.evidenceSha256,
    candidateId:representation.candidateId,
    representationArtifactSha256:representation.representationArtifactSha256,
    representationBytes:representation.representationBytes,
    representationMetadataSha256:representation.representationMetadataSha256,
    benchmarkBindingSha256,
    benchmarkBinding:binding,
    measurementCeilings:Object.freeze({
      maxSamplesPerRow:MAX_SAMPLES_PER_ROW,
      maxLatencyMicros:MAX_LATENCY_MICROS,
      maxMemoryBytes:MAX_MEMORY_BYTES,
      maxBytesMovedPerRun:MAX_BYTES_MOVED_PER_RUN,
    }),
    networkPolicy:'SEALED_INPUTS_ONLY',
    modelAcquisitionAllowed:false,
    providerSelectionAllowed:false,
    scheduleSelectionAllowed:false,
  });
}

function normalizeStepMatrixResult(
  raw:unknown,
  binding:HsmeDenseStudentBenchmarkBindingV1,
  request:CoreHsmeDenseStudentStepMatrixRequestV1,
):CoreHsmeDenseStudentStepMatrixResultV1{
  const record=exactRecord(raw,[
    'schemaVersion',
    'state',
    'representationEvidenceSha256',
    'representationArtifactSha256',
    'benchmarkBindingSha256',
    'rows',
    'stdoutEvidenceSha256',
    'stderrEvidenceSha256',
    'benchmarkAttemptId',
    'benchmarkResultSha256',
  ],'stepMatrixResult');
  if(record.schemaVersion!==CORE_HSME_DENSE_STUDENT_STEP_MATRIX_RESULT_V1_SCHEMA){
    fail('hsme_step_matrix_result_schema','step matrix result schema unsupported');
  }
  const state=enumValue(
    record.state,
    ['STEP_MATRIX_MEASUREMENT_FAILED','STEP_MATRIX_MEASUREMENT_COMPLETED'] as const,
    'stepMatrixResult.state',
  );
  if(!Array.isArray(record.rows)||record.rows.length>8){
    fail('hsme_step_matrix_result_rows','rows must contain at most 8 entries');
  }
  const rows=record.rows.map((row,index)=>
    normalizeRow(row,index,binding,request)
  ).sort(compareRows);

  if(state==='STEP_MATRIX_MEASUREMENT_COMPLETED'){
    const expectedKeys=HSME_DENSE_STUDENT_FIXED_CAPABILITIES_V1.flatMap(capability=>
      HSME_DENSE_STUDENT_FIXED_STEP_COUNTS_V1.map(step=>capability+'\0'+step)
    ).sort(lexical);
    const actualKeys=rows.map(row=>row.capability+'\0'+row.stepCount).sort(lexical);
    if(
      actualKeys.length!==expectedKeys.length
      ||actualKeys.some((value,index)=>value!==expectedKeys[index])
    ){
      fail(
        'hsme_step_matrix_result_roster',
        'completed result must cover every capability x [2,4,6,8] exactly once',
      );
    }
    assertComparableMeasurementContext(rows);
  }else if(rows.length!==0){
    fail('hsme_step_matrix_failed_rows','failed result cannot carry measured rows');
  }

  const result=deepFreeze({
    schemaVersion:CORE_HSME_DENSE_STUDENT_STEP_MATRIX_RESULT_V1_SCHEMA,
    state,
    representationEvidenceSha256:sha256(
      record.representationEvidenceSha256,
      'stepMatrixResult.representationEvidenceSha256',
    ),
    representationArtifactSha256:sha256(
      record.representationArtifactSha256,
      'stepMatrixResult.representationArtifactSha256',
    ),
    benchmarkBindingSha256:sha256(
      record.benchmarkBindingSha256,
      'stepMatrixResult.benchmarkBindingSha256',
    ),
    rows:Object.freeze(rows),
    stdoutEvidenceSha256:sha256(
      record.stdoutEvidenceSha256,
      'stepMatrixResult.stdoutEvidenceSha256',
    ),
    stderrEvidenceSha256:sha256(
      record.stderrEvidenceSha256,
      'stepMatrixResult.stderrEvidenceSha256',
    ),
    benchmarkAttemptId:identifier(
      record.benchmarkAttemptId,
      'stepMatrixResult.benchmarkAttemptId',
      200,
    ),
    benchmarkResultSha256:sha256(
      record.benchmarkResultSha256,
      'stepMatrixResult.benchmarkResultSha256',
    ),
  });
  if(result.representationEvidenceSha256!==request.representationEvidenceSha256){
    fail(
      'hsme_step_matrix_result_representation_binding',
      'result representation evidence digest drift',
    );
  }
  if(result.representationArtifactSha256!==request.representationArtifactSha256){
    fail(
      'hsme_step_matrix_result_artifact_binding',
      'result representation artifact digest drift',
    );
  }
  if(result.benchmarkBindingSha256!==request.benchmarkBindingSha256){
    fail(
      'hsme_step_matrix_result_benchmark_binding',
      'result benchmark binding digest drift',
    );
  }
  return result;
}

function normalizeRow(
  raw:unknown,
  index:number,
  binding:HsmeDenseStudentBenchmarkBindingV1,
  request:CoreHsmeDenseStudentStepMatrixRequestV1,
):HsmeDenseStudentStepMeasurementRowV1{
  const path='stepMatrixResult.rows['+index+']';
  const record=exactRecord(raw,[
    'stepCount',
    'capability',
    'outputSetSha256',
    'sampleCount',
    'successCount',
    'failureCount',
    'criticalFailureCount',
    'qualityDimensions',
    'coldEndToEndLatencyMicros',
    'warmEndToEndLatencyMicros',
    'perStepLatencyMicros',
    'peakRamBytes',
    'peakAcceleratorBytes',
    'activeRepresentationBytes',
    'residentRepresentationBytes',
    'flashBytesMovedPerRun',
    'hardwareProfileSha256',
    'runtimeIdentity',
    'providerIdentity',
    'measurementMethodSha256',
    'measurementEvidenceSha256',
  ],path);
  const stepCount=enumNumber(
    record.stepCount,
    HSME_DENSE_STUDENT_FIXED_STEP_COUNTS_V1,
    path+'.stepCount',
  );
  const capability=enumValue(
    record.capability,
    HSME_DENSE_STUDENT_FIXED_CAPABILITIES_V1,
    path+'.capability',
  );
  const capabilityBinding=binding.capabilities.find(
    value=>value.capability===capability,
  );
  if(!capabilityBinding){
    fail('hsme_step_matrix_row_capability','row capability absent from binding');
  }
  if(!Array.isArray(record.qualityDimensions)){
    fail('hsme_step_matrix_row_dimensions',path+'.qualityDimensions must be an array');
  }
  const qualityDimensions=record.qualityDimensions.map((rawDimension,dimensionIndex)=>{
    const dimension=exactRecord(rawDimension,[
      'dimensionId','lossMicrounits','criticalFailureObserved','evidenceSha256',
    ],path+'.qualityDimensions['+dimensionIndex+']');
    return Object.freeze({
      dimensionId:identifier(
        dimension.dimensionId,
        path+'.qualityDimensions['+dimensionIndex+'].dimensionId',
        120,
      ),
      lossMicrounits:safeInteger(
        dimension.lossMicrounits,
        path+'.qualityDimensions['+dimensionIndex+'].lossMicrounits',
        0,
        Number.MAX_SAFE_INTEGER,
      ),
      criticalFailureObserved:booleanValue(
        dimension.criticalFailureObserved,
        path+'.qualityDimensions['+dimensionIndex+'].criticalFailureObserved',
      ),
      evidenceSha256:sha256(
        dimension.evidenceSha256,
        path+'.qualityDimensions['+dimensionIndex+'].evidenceSha256',
      ),
    });
  }).sort((a,b)=>lexical(a.dimensionId,b.dimensionId));
  const dimensionIds=qualityDimensions.map(value=>value.dimensionId);
  if(
    dimensionIds.length!==capabilityBinding.dimensionIds.length
    ||dimensionIds.some(
      (value,dimensionIndex)=>value!==capabilityBinding.dimensionIds[dimensionIndex],
    )
  ){
    fail(
      'hsme_step_matrix_row_dimensions',
      'row dimensions must exactly equal frozen capability dimensionIds',
    );
  }

  const sampleCount=safeInteger(
    record.sampleCount,path+'.sampleCount',1,MAX_SAMPLES_PER_ROW,
  );
  const successCount=safeInteger(
    record.successCount,path+'.successCount',0,sampleCount,
  );
  const failureCount=safeInteger(
    record.failureCount,path+'.failureCount',0,sampleCount,
  );
  if(successCount+failureCount!==sampleCount){
    fail(
      'hsme_step_matrix_row_sample_accounting',
      'successCount + failureCount must equal sampleCount',
    );
  }
  const criticalFailureCount=safeInteger(
    record.criticalFailureCount,
    path+'.criticalFailureCount',
    0,
    sampleCount,
  );
  const activeRepresentationBytes=safeInteger(
    record.activeRepresentationBytes,
    path+'.activeRepresentationBytes',
    1,
    request.representationBytes,
  );

  return deepFreeze({
    stepCount,
    capability,
    outputSetSha256:sha256(record.outputSetSha256,path+'.outputSetSha256'),
    sampleCount,
    successCount,
    failureCount,
    criticalFailureCount,
    qualityDimensions:Object.freeze(qualityDimensions),
    coldEndToEndLatencyMicros:safeInteger(
      record.coldEndToEndLatencyMicros,
      path+'.coldEndToEndLatencyMicros',
      0,
      MAX_LATENCY_MICROS,
    ),
    warmEndToEndLatencyMicros:safeInteger(
      record.warmEndToEndLatencyMicros,
      path+'.warmEndToEndLatencyMicros',
      0,
      MAX_LATENCY_MICROS,
    ),
    perStepLatencyMicros:safeInteger(
      record.perStepLatencyMicros,
      path+'.perStepLatencyMicros',
      0,
      MAX_LATENCY_MICROS,
    ),
    peakRamBytes:safeInteger(
      record.peakRamBytes,path+'.peakRamBytes',0,MAX_MEMORY_BYTES,
    ),
    peakAcceleratorBytes:safeInteger(
      record.peakAcceleratorBytes,
      path+'.peakAcceleratorBytes',
      0,
      MAX_MEMORY_BYTES,
    ),
    activeRepresentationBytes,
    residentRepresentationBytes:safeInteger(
      record.residentRepresentationBytes,
      path+'.residentRepresentationBytes',
      1,
      MAX_MEMORY_BYTES,
    ),
    flashBytesMovedPerRun:safeInteger(
      record.flashBytesMovedPerRun,
      path+'.flashBytesMovedPerRun',
      0,
      MAX_BYTES_MOVED_PER_RUN,
    ),
    hardwareProfileSha256:sha256(
      record.hardwareProfileSha256,path+'.hardwareProfileSha256',
    ),
    runtimeIdentity:identifier(
      record.runtimeIdentity,path+'.runtimeIdentity',160,
    ),
    providerIdentity:identifier(
      record.providerIdentity,path+'.providerIdentity',160,
    ),
    measurementMethodSha256:sha256(
      record.measurementMethodSha256,path+'.measurementMethodSha256',
    ),
    measurementEvidenceSha256:sha256(
      record.measurementEvidenceSha256,path+'.measurementEvidenceSha256',
    ),
  });
}

function assertComparableMeasurementContext(
  rows:readonly HsmeDenseStudentStepMeasurementRowV1[],
):void{
  const first=rows[0];
  if(!first){
    fail('hsme_step_matrix_result_roster','completed result rows missing');
  }
  for(const row of rows.slice(1)){
    if(row.hardwareProfileSha256!==first.hardwareProfileSha256){
      fail('hsme_step_matrix_hardware_drift','all rows must use one hardware profile');
    }
    if(row.runtimeIdentity!==first.runtimeIdentity){
      fail('hsme_step_matrix_runtime_drift','all rows must use one runtime identity');
    }
    if(row.providerIdentity!==first.providerIdentity){
      fail('hsme_step_matrix_provider_drift','all rows must use one provider identity');
    }
    if(row.measurementMethodSha256!==first.measurementMethodSha256){
      fail('hsme_step_matrix_method_drift','all rows must use one measurement method');
    }
  }
}

function resultPayload(
  value:CoreHsmeDenseStudentStepMatrixResultV1,
):Omit<CoreHsmeDenseStudentStepMatrixResultV1,'benchmarkResultSha256'>{
  return {
    schemaVersion:value.schemaVersion,
    state:value.state,
    representationEvidenceSha256:value.representationEvidenceSha256,
    representationArtifactSha256:value.representationArtifactSha256,
    benchmarkBindingSha256:value.benchmarkBindingSha256,
    rows:value.rows,
    stdoutEvidenceSha256:value.stdoutEvidenceSha256,
    stderrEvidenceSha256:value.stderrEvidenceSha256,
    benchmarkAttemptId:value.benchmarkAttemptId,
  };
}

function representationAuthorityWidened(
  value:HsmeDenseStudentRepresentationEvidenceV1,
):boolean{
  return value.checkpointPromotionAllowed!==false
    ||value.modelInstallAllowed!==false
    ||value.modelFleetPromotionAllowed!==false
    ||value.durableModelFleetPromotionAllowed!==false
    ||value.productionAuthorityGranted!==false
    ||value.providerAuthorityGranted!==false
    ||value.billingAuthorityGranted!==false
    ||value.projectArtifactMutationAllowed!==false
    ||value.aeeExecutionAuthorityGranted!==false
    ||value.winnerSelectionAllowed!==false;
}

function authorityBoundary(){
  return Object.freeze({
    weightedAggregateScoreAllowed:false as const,
    efficiencyMayOverrideQualityFailure:false as const,
    scheduleSelectionAllowed:false as const,
    candidateSelectionAllowed:false as const,
    checkpointPromotionAllowed:false as const,
    modelInstallAllowed:false as const,
    modelFleetPromotionAllowed:false as const,
    durableModelFleetPromotionAllowed:false as const,
    productionAuthorityGranted:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    projectArtifactMutationAllowed:false as const,
    aeeExecutionAuthorityGranted:false as const,
    winnerSelectionAllowed:false as const,
  });
}

type PartialEvidenceValues=Partial<Pick<
  HsmeDenseStudentStepMatrixEvidenceV1,
  'representationEvidenceSha256'|'candidateId'|'representationArtifactSha256'|
  'representationBytes'|'benchmarkBindingSha256'|'benchmarkResultSha256'|
  'benchmarkAttemptId'
>>;

function invalid(
  blockers:readonly string[],
  values:PartialEvidenceValues={},
):HsmeDenseStudentStepMatrixEvidenceV1{
  return terminal('STEP_MATRIX_INVALID',blockers,values);
}

function blocked(
  blockers:readonly string[],
  values:PartialEvidenceValues={},
):HsmeDenseStudentStepMatrixEvidenceV1{
  return terminal('STEP_MATRIX_BLOCKED',blockers,values);
}

function measurementFailed(
  blockers:readonly string[],
  values:PartialEvidenceValues={},
):HsmeDenseStudentStepMatrixEvidenceV1{
  return terminal('STEP_MATRIX_MEASUREMENT_FAILED',blockers,values);
}

function terminal(
  state:'STEP_MATRIX_INVALID'|'STEP_MATRIX_BLOCKED'|'STEP_MATRIX_MEASUREMENT_FAILED',
  blockers:readonly string[],
  values:PartialEvidenceValues,
):HsmeDenseStudentStepMatrixEvidenceV1{
  return Object.freeze({
    schemaVersion:HSME_DENSE_STUDENT_STEP_MATRIX_EVIDENCE_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    representationEvidenceSha256:values.representationEvidenceSha256??'UNKNOWN',
    candidateId:values.candidateId??'UNKNOWN',
    representationArtifactSha256:values.representationArtifactSha256??'UNKNOWN',
    representationBytes:values.representationBytes??'UNKNOWN',
    benchmarkBindingSha256:values.benchmarkBindingSha256??'UNKNOWN',
    benchmarkResultSha256:values.benchmarkResultSha256??'UNKNOWN',
    benchmarkAttemptId:values.benchmarkAttemptId??'UNKNOWN',
    rows:Object.freeze([]),
    evidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function compareRows(
  a:HsmeDenseStudentStepMeasurementRowV1,
  b:HsmeDenseStudentStepMeasurementRowV1,
):number{
  return lexical(a.capability,b.capability)||a.stepCount-b.stepCount;
}

function exactRecord(
  raw:unknown,
  allowed:readonly string[],
  path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_step_matrix_exact_schema',path+' must be an object');
  }
  const record=raw as Record<string,unknown>;
  const keys=Object.keys(record);
  if(
    keys.length!==allowed.length
    ||keys.some(key=>!allowed.includes(key))
    ||allowed.some(key=>!Object.hasOwn(record,key))
  ){
    fail('hsme_step_matrix_exact_schema',path+' has unknown or missing fields');
  }
  return record;
}

function enumValue<T extends readonly string[]>(
  raw:unknown,
  values:T,
  path:string,
):T[number]{
  if(typeof raw!=='string'||!(values as readonly string[]).includes(raw)){
    fail('hsme_step_matrix_enum',path+' is unsupported');
  }
  return raw as T[number];
}

function enumNumber<T extends readonly number[]>(
  raw:unknown,
  values:T,
  path:string,
):T[number]{
  if(typeof raw!=='number'||!(values as readonly number[]).includes(raw)){
    fail('hsme_step_matrix_enum',path+' is unsupported');
  }
  return raw as T[number];
}

function identifier(raw:unknown,path:string,max:number):string{
  if(
    typeof raw!=='string'
    ||raw.length<1
    ||raw.length>max
    ||raw.trim()!==raw
    ||!IDENTIFIER.test(raw)
  ){
    fail('hsme_step_matrix_identifier',path+' is invalid');
  }
  return raw;
}

function sha256(raw:unknown,path:string):string{
  if(typeof raw!=='string'||!HEX64.test(raw)){
    fail('hsme_step_matrix_hash',path+' must be lowercase SHA-256');
  }
  return raw;
}

function booleanValue(raw:unknown,path:string):boolean{
  if(typeof raw!=='boolean'){
    fail('hsme_step_matrix_boolean',path+' must be boolean');
  }
  return raw;
}

function safeInteger(
  raw:unknown,
  path:string,
  min:number,
  max:number,
):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<min||(raw as number)>max){
    fail('hsme_step_matrix_integer',path+' must be a bounded safe integer');
  }
  return raw as number;
}

async function verify(run:()=>Promise<boolean>):Promise<boolean>{
  try{return await run()===true;}catch{return false;}
}

async function digest(
  domain:string,
  value:unknown,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  const result=await hash.sha256(
    new TextEncoder().encode(domain+JSON.stringify(value)),
  );
  if(!HEX64.test(result)){
    fail('hsme_step_matrix_hash_port','hash port must return lowercase SHA-256');
  }
  return result;
}

function errorCodeSuffix(error:unknown):string{
  if(error&&typeof error==='object'&&'code' in error){
    const code=(error as {code?:unknown}).code;
    if(typeof code==='string'&&code.length>0)return ':'+code;
  }
  return '';
}

function deepFreeze<T>(value:T):T{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(value as Record<string,unknown>)){
      deepFreeze(child);
    }
  }
  return value;
}

function lexical(a:string,b:string):number{return a<b?-1:a>b?1:0;}

function fail(code:string,message:string):never{
  throw new HsmeDenseStudentStepMatrixV1Error(code,message);
}
