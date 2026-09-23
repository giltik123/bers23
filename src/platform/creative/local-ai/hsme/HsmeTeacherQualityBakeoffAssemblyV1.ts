import {
  hsmeTeacherArtifactManifestDigestV1,
  normalizeHsmeTeacherArtifactManifestV1,
  type HsmeTeacherArtifactManifestV1,
} from './HsmeTeacherArtifactManifestV1';
import {
  HSME_TEACHER_QUALITY_BAKEOFF_V1_SCHEMA,
  normalizeHsmeTeacherQualityBakeoffV1,
  type HsmeTeacherQualityBakeoffV1,
} from './HsmeTeacherQualityEvidenceV1';
import {
  HSME_QUALITY_POLICY_V1,
  type HsmeTrainingHashPortV1,
} from './HsmeTrainingProvenanceV1';

export const HSME_TEACHER_QUALITY_BENCHMARK_POLICY_V1_SCHEMA =
  'BERS_HSME_TEACHER_QUALITY_BENCHMARK_POLICY_V1' as const;
export const HSME_TEACHER_TARGET_OUTPUT_EVIDENCE_V1_SCHEMA =
  'BERS_HSME_TEACHER_TARGET_OUTPUT_EVIDENCE_V1' as const;
export const HSME_TEACHER_AUTOMATED_QUALITY_MEASUREMENT_V1_SCHEMA =
  'BERS_HSME_TEACHER_AUTOMATED_QUALITY_MEASUREMENT_V1' as const;
export const HSME_TEACHER_BLINDED_HUMAN_REVIEW_V1_SCHEMA =
  'BERS_HSME_TEACHER_BLINDED_HUMAN_REVIEW_V1' as const;
export const HSME_TEACHER_QUALITY_BAKEOFF_ASSEMBLY_V1_SCHEMA =
  'BERS_HSME_TEACHER_QUALITY_BAKEOFF_ASSEMBLY_V1' as const;

export const HSME_TEACHER_QUALITY_BENCHMARK_POLICY_DIGEST_DOMAIN =
  'bers:hsme:teacher-quality-benchmark-policy:v1\0' as const;
export const HSME_TEACHER_TARGET_OUTPUT_EVIDENCE_DIGEST_DOMAIN =
  'bers:hsme:teacher-target-output-evidence:v1\0' as const;
export const HSME_TEACHER_AUTOMATED_QUALITY_MEASUREMENT_DIGEST_DOMAIN =
  'bers:hsme:teacher-automated-quality-measurement:v1\0' as const;
export const HSME_TEACHER_BLINDED_HUMAN_REVIEW_DIGEST_DOMAIN =
  'bers:hsme:teacher-blinded-human-review:v1\0' as const;
export const HSME_TEACHER_QUALITY_OUTPUT_SET_AGGREGATE_DIGEST_DOMAIN =
  'bers:hsme:teacher-quality-output-set-aggregate:v1\0' as const;
export const HSME_TEACHER_QUALITY_SELECTION_RATIONALE_DIGEST_DOMAIN =
  'bers:hsme:teacher-quality-selection-rationale:v1\0' as const;
export const HSME_TEACHER_QUALITY_BAKEOFF_CONTENT_DIGEST_DOMAIN =
  'bers:hsme:teacher-quality-bakeoff-content:v1\0' as const;
export const HSME_TEACHER_QUALITY_BAKEOFF_ASSEMBLY_DIGEST_DOMAIN =
  'bers:hsme:teacher-quality-bakeoff-assembly:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IMMUTABLE_REVISION=/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const IDENTIFIER=/^[a-z0-9][a-z0-9._:@/-]*$/;
const CAPABILITIES=Object.freeze([
  'TEXT_TO_IMAGE',
  'IMAGE_EDITING',
  'MULTI_REFERENCE_EDITING',
] as const);
const DIRECTIONS=Object.freeze(['HIGHER_IS_BETTER','LOWER_IS_BETTER'] as const);
const HUMAN_DECISIONS=Object.freeze(['PASS','FAIL'] as const);
type Capability=typeof CAPABILITIES[number];
type Direction=typeof DIRECTIONS[number];
type HumanDecision=typeof HUMAN_DECISIONS[number];

export type HsmeTeacherQualityAutomatedRequirementV1=Readonly<{
  metricId:string;
  capability:Capability;
  direction:Direction;
  thresholdMicrounits:number;
}>;

export type HsmeTeacherQualityHumanRequirementV1=Readonly<{
  dimensionId:string;
  capability:Capability;
  rubricSha256:string;
}>;

export type HsmeTeacherQualityBenchmarkPolicyV1=Readonly<{
  schemaVersion:typeof HSME_TEACHER_QUALITY_BENCHMARK_POLICY_V1_SCHEMA;
  policy:typeof HSME_QUALITY_POLICY_V1;
  benchmarkPolicyId:string;
  fixtureSetSha256:string;
  requiredCapabilities:readonly Capability[];
  automatedRequirements:readonly HsmeTeacherQualityAutomatedRequirementV1[];
  humanRequirements:readonly HsmeTeacherQualityHumanRequirementV1[];
  efficiencyUsedForQualitySelection:false;
  teacherAdmissionAllowed:false;
  trainingStartAllowed:false;
  productionAuthorityGranted:false;
}>;

export type HsmeTeacherCapabilityOutputRefV1=Readonly<{
  capability:Capability;
  outputSetSha256:string;
}>;

export type HsmeTeacherTargetOutputEvidenceV1=Readonly<{
  schemaVersion:typeof HSME_TEACHER_TARGET_OUTPUT_EVIDENCE_V1_SCHEMA;
  teacherCandidateId:string;
  immutableRevision:string;
  modelContentSha256:string;
  benchmarkPolicySha256:string;
  fixtureSetSha256:string;
  toolchainEvidenceSha256:string;
  executionEvidenceSha256:string;
  capabilityOutputs:readonly HsmeTeacherCapabilityOutputRefV1[];
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  teacherAdmissionAllowed:false;
  trainingStartAllowed:false;
  productionAuthorityGranted:false;
}>;

export type HsmeTeacherAutomatedQualityMeasurementV1=Readonly<{
  schemaVersion:typeof HSME_TEACHER_AUTOMATED_QUALITY_MEASUREMENT_V1_SCHEMA;
  teacherCandidateId:string;
  capability:Capability;
  metricId:string;
  benchmarkPolicySha256:string;
  outputSetSha256:string;
  observedMicrounits:number;
  measurementEvidenceSha256:string;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  teacherAdmissionAllowed:false;
  trainingStartAllowed:false;
  productionAuthorityGranted:false;
}>;

export type HsmeTeacherBlindedHumanReviewV1=Readonly<{
  schemaVersion:typeof HSME_TEACHER_BLINDED_HUMAN_REVIEW_V1_SCHEMA;
  teacherCandidateId:string;
  capability:Capability;
  dimensionId:string;
  benchmarkPolicySha256:string;
  outputSetSha256:string;
  panelSha256:string;
  reviewEvidenceSha256:string;
  decision:HumanDecision;
  candidateIdentityIncluded:false;
  latencyIncluded:false;
  sizeIncluded:false;
  costIncluded:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  teacherAdmissionAllowed:false;
  trainingStartAllowed:false;
  productionAuthorityGranted:false;
}>;

export interface HsmeTeacherQualityEvidenceOriginVerifierV1{
  verifyTargetOutput(
    evidence:HsmeTeacherTargetOutputEvidenceV1,
    evidenceSha256:string,
  ):Promise<boolean>;
  verifyAutomatedMeasurement(
    evidence:HsmeTeacherAutomatedQualityMeasurementV1,
    evidenceSha256:string,
  ):Promise<boolean>;
  verifyBlindedHumanReview(
    evidence:HsmeTeacherBlindedHumanReviewV1,
    evidenceSha256:string,
  ):Promise<boolean>;
}

export type HsmeTeacherQualityBakeoffAssemblyManifestRefV1=Readonly<{
  teacherCandidateId:string;
  manifestSha256:string;
  immutableRevision:string;
}>;

export type HsmeTeacherQualityBakeoffAssemblyV1=Readonly<{
  schemaVersion:typeof HSME_TEACHER_QUALITY_BAKEOFF_ASSEMBLY_V1_SCHEMA;
  benchmarkPolicySha256:string;
  fixtureSetSha256:string;
  candidateManifestRefs:readonly HsmeTeacherQualityBakeoffAssemblyManifestRefV1[];
  bakeoffSha256:string;
  bakeoffAssemblySha256:string;
  bakeoff:HsmeTeacherQualityBakeoffV1;
  efficiencyUsedForQualitySelection:false;
  selectedTeacherIdsAllowed:false;
  teacherAdmissionAllowed:false;
  trainingStartAllowed:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  durableModelFleetPromotionAllowed:false;
  winnerSelectionAllowed:false;
  productionAuthorityGranted:false;
}>;

export class HsmeTeacherQualityBakeoffAssemblyV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeTeacherQualityBakeoffAssemblyV1Error';
    this.code=code;
  }
}

export async function hsmeTeacherQualityBenchmarkPolicyV1Digest(
  raw:unknown,
  hash:HsmeTrainingHashPortV1,
):Promise<string>{
  const policy=normalizeHsmeTeacherQualityBenchmarkPolicyV1(raw);
  return digest(HSME_TEACHER_QUALITY_BENCHMARK_POLICY_DIGEST_DOMAIN,policy,hash,'quality_policy_hash_invalid');
}

export function normalizeHsmeTeacherQualityBenchmarkPolicyV1(
  raw:unknown,
):HsmeTeacherQualityBenchmarkPolicyV1{
  const record=exactRecord(raw,[
    'schemaVersion','policy','benchmarkPolicyId','fixtureSetSha256',
    'requiredCapabilities','automatedRequirements','humanRequirements',
    'efficiencyUsedForQualitySelection','teacherAdmissionAllowed',
    'trainingStartAllowed','productionAuthorityGranted',
  ],'benchmarkPolicy');
  if(record.schemaVersion!==HSME_TEACHER_QUALITY_BENCHMARK_POLICY_V1_SCHEMA){
    fail('quality_policy_schema_invalid','teacher quality benchmark policy schema invalid');
  }
  if(record.policy!==HSME_QUALITY_POLICY_V1){
    fail('quality_policy_quality_law_invalid',`policy must be ${HSME_QUALITY_POLICY_V1}`);
  }
  requireFalse(record.efficiencyUsedForQualitySelection,'benchmarkPolicy.efficiencyUsedForQualitySelection');
  requireFalse(record.teacherAdmissionAllowed,'benchmarkPolicy.teacherAdmissionAllowed');
  requireFalse(record.trainingStartAllowed,'benchmarkPolicy.trainingStartAllowed');
  requireFalse(record.productionAuthorityGranted,'benchmarkPolicy.productionAuthorityGranted');

  const requiredCapabilities=capabilitySet(record.requiredCapabilities,'benchmarkPolicy.requiredCapabilities',1,CAPABILITIES.length);
  if(!Array.isArray(record.automatedRequirements)||record.automatedRequirements.length<requiredCapabilities.length||record.automatedRequirements.length>64){
    fail('quality_policy_automated_requirements_invalid','automated requirements count invalid');
  }
  if(!Array.isArray(record.humanRequirements)||record.humanRequirements.length<requiredCapabilities.length||record.humanRequirements.length>64){
    fail('quality_policy_human_requirements_invalid','human requirements count invalid');
  }

  const automated=record.automatedRequirements.map((value,index)=>{
    const item=exactRecord(value,['metricId','capability','direction','thresholdMicrounits'],`benchmarkPolicy.automatedRequirements[${index}]`);
    return Object.freeze({
      metricId:identifier(item.metricId,`automatedRequirements[${index}].metricId`,120),
      capability:enumValue(item.capability,CAPABILITIES,`automatedRequirements[${index}].capability`),
      direction:enumValue(item.direction,DIRECTIONS,`automatedRequirements[${index}].direction`),
      thresholdMicrounits:safeInteger(item.thresholdMicrounits,`automatedRequirements[${index}].thresholdMicrounits`,Number.MIN_SAFE_INTEGER,Number.MAX_SAFE_INTEGER),
    });
  });
  const human=record.humanRequirements.map((value,index)=>{
    const item=exactRecord(value,['dimensionId','capability','rubricSha256'],`benchmarkPolicy.humanRequirements[${index}]`);
    return Object.freeze({
      dimensionId:identifier(item.dimensionId,`humanRequirements[${index}].dimensionId`,120),
      capability:enumValue(item.capability,CAPABILITIES,`humanRequirements[${index}].capability`),
      rubricSha256:sha256(item.rubricSha256,`humanRequirements[${index}].rubricSha256`),
    });
  });

  uniqueComposite(automated.map(value=>value.metricId),'quality_policy_automated_requirement_duplicate');
  uniqueComposite(human.map(value=>value.dimensionId),'quality_policy_human_requirement_duplicate');
  for(const capability of requiredCapabilities){
    if(!automated.some(value=>value.capability===capability)){
      fail('quality_policy_automated_capability_missing',`missing automated requirement for ${capability}`);
    }
    if(!human.some(value=>value.capability===capability)){
      fail('quality_policy_human_capability_missing',`missing human requirement for ${capability}`);
    }
  }

  return Object.freeze({
    schemaVersion:HSME_TEACHER_QUALITY_BENCHMARK_POLICY_V1_SCHEMA,
    policy:HSME_QUALITY_POLICY_V1,
    benchmarkPolicyId:identifier(record.benchmarkPolicyId,'benchmarkPolicyId',160),
    fixtureSetSha256:sha256(record.fixtureSetSha256,'fixtureSetSha256'),
    requiredCapabilities,
    automatedRequirements:Object.freeze([...automated].sort((a,b)=>lexical(a.capability,b.capability)||lexical(a.metricId,b.metricId))),
    humanRequirements:Object.freeze([...human].sort((a,b)=>lexical(a.capability,b.capability)||lexical(a.dimensionId,b.dimensionId))),
    efficiencyUsedForQualitySelection:false,
    teacherAdmissionAllowed:false,
    trainingStartAllowed:false,
    productionAuthorityGranted:false,
  });
}

export async function assembleHsmeTeacherQualityBakeoffV1(
  rawPolicy:unknown,
  rawManifests:readonly unknown[],
  rawOutputs:readonly unknown[],
  rawAutomatedMeasurements:readonly unknown[],
  rawHumanReviews:readonly unknown[],
  origin:HsmeTeacherQualityEvidenceOriginVerifierV1,
  hash:HsmeTrainingHashPortV1,
):Promise<HsmeTeacherQualityBakeoffAssemblyV1>{
  const policy=normalizeHsmeTeacherQualityBenchmarkPolicyV1(rawPolicy);
  const benchmarkPolicySha256=await digest(
    HSME_TEACHER_QUALITY_BENCHMARK_POLICY_DIGEST_DOMAIN,
    policy,hash,'quality_policy_hash_invalid',
  );

  if(!Array.isArray(rawManifests)||rawManifests.length<3||rawManifests.length>12){
    fail('quality_manifest_count_invalid','quality bakeoff requires 3..12 acquired teacher manifests');
  }
  const manifests=rawManifests.map(normalizeHsmeTeacherArtifactManifestV1);
  const manifestById=new Map<string,HsmeTeacherArtifactManifestV1>();
  const manifestRefs:HsmeTeacherQualityBakeoffAssemblyManifestRefV1[]=[];
  for(const manifest of manifests){
    if(manifestById.has(manifest.teacherCandidateId)){
      fail('quality_manifest_duplicate',`duplicate manifest for ${manifest.teacherCandidateId}`);
    }
    if(manifest.artifacts.some(value=>value.role==='RUNTIME_CODE')){
      fail('quality_manifest_runtime_code_forbidden',`${manifest.teacherCandidateId} contains runtime code`);
    }
    const manifestSha256=await hsmeTeacherArtifactManifestDigestV1(manifest,hash);
    manifestById.set(manifest.teacherCandidateId,manifest);
    manifestRefs.push(Object.freeze({
      teacherCandidateId:manifest.teacherCandidateId,
      manifestSha256,
      immutableRevision:manifest.primarySource.immutableRevision,
    }));
  }
  manifestRefs.sort((a,b)=>lexical(a.teacherCandidateId,b.teacherCandidateId));

  if(!Array.isArray(rawOutputs)||rawOutputs.length!==manifests.length){
    fail('quality_output_candidate_set_invalid','target output evidence must match every acquired teacher exactly once');
  }
  const outputs=rawOutputs.map((value,index)=>normalizeOutputEvidence(value,`outputs[${index}]`));
  const outputById=new Map<string,HsmeTeacherTargetOutputEvidenceV1>();
  const outputDigestById=new Map<string,string>();
  for(const output of outputs){
    if(outputById.has(output.teacherCandidateId)){
      fail('quality_output_duplicate',`duplicate output evidence for ${output.teacherCandidateId}`);
    }
    const manifest=manifestById.get(output.teacherCandidateId);
    if(!manifest){
      fail('quality_output_unknown_candidate',`output evidence candidate ${output.teacherCandidateId} has no acquired manifest`);
    }
    const manifestRef=manifestRefs.find(value=>value.teacherCandidateId===output.teacherCandidateId)!;
    if(output.immutableRevision!==manifest.primarySource.immutableRevision){
      fail('quality_output_revision_drift',`${output.teacherCandidateId} output revision differs from acquired manifest`);
    }
    if(output.modelContentSha256!==manifestRef.manifestSha256){
      fail('quality_output_content_drift',`${output.teacherCandidateId} output content differs from canonical manifest`);
    }
    if(output.benchmarkPolicySha256!==benchmarkPolicySha256){
      fail('quality_output_policy_drift',`${output.teacherCandidateId} output benchmark policy digest drift`);
    }
    if(output.fixtureSetSha256!==policy.fixtureSetSha256){
      fail('quality_output_fixture_drift',`${output.teacherCandidateId} output fixture set drift`);
    }
    const evidenceSha256=await digest(
      HSME_TEACHER_TARGET_OUTPUT_EVIDENCE_DIGEST_DOMAIN,
      output,hash,'quality_output_hash_invalid',
    );
    if(!await verifyOrigin(()=>origin.verifyTargetOutput(output,evidenceSha256))){
      fail('quality_output_origin_unverified',`${output.teacherCandidateId} target output origin unverified`);
    }
    outputById.set(output.teacherCandidateId,output);
    outputDigestById.set(output.teacherCandidateId,evidenceSha256);
  }
  if(outputById.size!==manifestById.size){
    fail('quality_output_candidate_set_invalid','output evidence candidate set incomplete');
  }

  for(const capability of policy.requiredCapabilities){
    if(!outputs.some(value=>value.capabilityOutputs.some(output=>output.capability===capability))){
      fail('quality_required_capability_unmeasured',`required capability ${capability} has no executed teacher`);
    }
  }

  if(!Array.isArray(rawAutomatedMeasurements)||rawAutomatedMeasurements.length<1||rawAutomatedMeasurements.length>768){
    fail('quality_automated_measurement_count_invalid','automated measurement evidence count invalid');
  }
  const measurements=rawAutomatedMeasurements.map((value,index)=>normalizeAutomatedMeasurement(value,`automatedMeasurements[${index}]`));
  const measurementByKey=new Map<string,HsmeTeacherAutomatedQualityMeasurementV1>();
  const measurementDigestByKey=new Map<string,string>();
  for(const measurement of measurements){
    const key=evidenceKey(measurement.teacherCandidateId,measurement.capability,measurement.metricId);
    if(measurementByKey.has(key)){
      fail('quality_automated_measurement_duplicate',`duplicate automated measurement ${key}`);
    }
    const output=outputById.get(measurement.teacherCandidateId);
    if(!output){
      fail('quality_automated_unknown_candidate',`automated measurement candidate unknown: ${measurement.teacherCandidateId}`);
    }
    const outputRef=output.capabilityOutputs.find(value=>value.capability===measurement.capability);
    if(!outputRef){
      fail('quality_automated_capability_unclaimed',`${key} references unexecuted capability`);
    }
    const requirement=policy.automatedRequirements.find(
      value=>value.capability===measurement.capability&&value.metricId===measurement.metricId,
    );
    if(!requirement){
      fail('quality_automated_requirement_unknown',`${key} is not pinned by benchmark policy`);
    }
    if(measurement.benchmarkPolicySha256!==benchmarkPolicySha256){
      fail('quality_automated_policy_drift',`${key} policy digest drift`);
    }
    if(measurement.outputSetSha256!==outputRef.outputSetSha256){
      fail('quality_automated_output_drift',`${key} output set digest drift`);
    }
    const evidenceSha256=await digest(
      HSME_TEACHER_AUTOMATED_QUALITY_MEASUREMENT_DIGEST_DOMAIN,
      measurement,hash,'quality_automated_hash_invalid',
    );
    if(!await verifyOrigin(()=>origin.verifyAutomatedMeasurement(measurement,evidenceSha256))){
      fail('quality_automated_origin_unverified',`${key} measurement origin unverified`);
    }
    measurementByKey.set(key,measurement);
    measurementDigestByKey.set(key,evidenceSha256);
  }

  if(!Array.isArray(rawHumanReviews)||rawHumanReviews.length<1||rawHumanReviews.length>768){
    fail('quality_human_review_count_invalid','human review evidence count invalid');
  }
  const reviews=rawHumanReviews.map((value,index)=>normalizeHumanReview(value,`humanReviews[${index}]`));
  const reviewByKey=new Map<string,HsmeTeacherBlindedHumanReviewV1>();
  const reviewDigestByKey=new Map<string,string>();
  for(const review of reviews){
    const key=evidenceKey(review.teacherCandidateId,review.capability,review.dimensionId);
    if(reviewByKey.has(key)){
      fail('quality_human_review_duplicate',`duplicate human review ${key}`);
    }
    const output=outputById.get(review.teacherCandidateId);
    if(!output){
      fail('quality_human_unknown_candidate',`human review candidate unknown: ${review.teacherCandidateId}`);
    }
    const outputRef=output.capabilityOutputs.find(value=>value.capability===review.capability);
    if(!outputRef){
      fail('quality_human_capability_unclaimed',`${key} references unexecuted capability`);
    }
    const requirement=policy.humanRequirements.find(
      value=>value.capability===review.capability&&value.dimensionId===review.dimensionId,
    );
    if(!requirement){
      fail('quality_human_requirement_unknown',`${key} is not pinned by benchmark policy`);
    }
    if(review.benchmarkPolicySha256!==benchmarkPolicySha256){
      fail('quality_human_policy_drift',`${key} policy digest drift`);
    }
    if(review.outputSetSha256!==outputRef.outputSetSha256){
      fail('quality_human_output_drift',`${key} output set digest drift`);
    }
    const evidenceSha256=await digest(
      HSME_TEACHER_BLINDED_HUMAN_REVIEW_DIGEST_DOMAIN,
      review,hash,'quality_human_hash_invalid',
    );
    if(!await verifyOrigin(()=>origin.verifyBlindedHumanReview(review,evidenceSha256))){
      fail('quality_human_origin_unverified',`${key} human review origin unverified`);
    }
    reviewByKey.set(key,review);
    reviewDigestByKey.set(key,evidenceSha256);
  }

  const candidateResults=[];
  for(const manifestRef of manifestRefs){
    const output=outputById.get(manifestRef.teacherCandidateId)!;
    const capabilities=output.capabilityOutputs.map(value=>value.capability);
    const automatedChecks=[];
    const humanChecks=[];

    for(const capability of capabilities){
      const automatedRequirements=policy.automatedRequirements.filter(value=>value.capability===capability);
      const humanRequirements=policy.humanRequirements.filter(value=>value.capability===capability);
      if(automatedRequirements.length<1){
        fail('quality_policy_automated_capability_missing',`no automated policy requirement for executed capability ${capability}`);
      }
      if(humanRequirements.length<1){
        fail('quality_policy_human_capability_missing',`no human policy requirement for executed capability ${capability}`);
      }
      for(const requirement of automatedRequirements){
        const key=evidenceKey(manifestRef.teacherCandidateId,capability,requirement.metricId);
        const measurement=measurementByKey.get(key);
        if(!measurement){
          fail('quality_automated_measurement_missing',`missing automated measurement ${key}`);
        }
        automatedChecks.push({
          metricId:requirement.metricId,
          capability,
          direction:requirement.direction,
          observedMicrounits:measurement.observedMicrounits,
          thresholdMicrounits:requirement.thresholdMicrounits,
          evidenceSha256:measurementDigestByKey.get(key)!,
        });
      }
      for(const requirement of humanRequirements){
        const key=evidenceKey(manifestRef.teacherCandidateId,capability,requirement.dimensionId);
        const review=reviewByKey.get(key);
        if(!review){
          fail('quality_human_review_missing',`missing human review ${key}`);
        }
        humanChecks.push({
          dimensionId:requirement.dimensionId,
          capability,
          rubricSha256:requirement.rubricSha256,
          panelSha256:review.panelSha256,
          evidenceSha256:reviewDigestByKey.get(key)!,
          decision:review.decision,
        });
      }
    }

    const outputSetSha256=await digest(
      HSME_TEACHER_QUALITY_OUTPUT_SET_AGGREGATE_DIGEST_DOMAIN,
      {
        teacherCandidateId:manifestRef.teacherCandidateId,
        capabilityOutputs:output.capabilityOutputs,
        targetOutputEvidenceSha256:outputDigestById.get(manifestRef.teacherCandidateId)!,
      },
      hash,'quality_output_aggregate_hash_invalid',
    );

    candidateResults.push({
      teacherCandidateId:manifestRef.teacherCandidateId,
      immutableRevision:manifestRef.immutableRevision,
      modelContentSha256:manifestRef.manifestSha256,
      capabilities,
      outputSetSha256,
      automatedChecks,
      humanChecks,
    });
  }

  if(measurementByKey.size!==candidateResults.reduce(
    (sum,result)=>sum+result.automatedChecks.length,0,
  )){
    fail('quality_automated_measurement_extra','automated evidence contains unconsumed records');
  }
  if(reviewByKey.size!==candidateResults.reduce(
    (sum,result)=>sum+result.humanChecks.length,0,
  )){
    fail('quality_human_review_extra','human evidence contains unconsumed records');
  }

  const selectionRationaleSha256=await digest(
    HSME_TEACHER_QUALITY_SELECTION_RATIONALE_DIGEST_DOMAIN,
    {
      policy:HSME_QUALITY_POLICY_V1,
      benchmarkPolicySha256,
      fixtureSetSha256:policy.fixtureSetSha256,
      candidateIds:manifestRefs.map(value=>value.teacherCandidateId),
      requiredCapabilities:policy.requiredCapabilities,
      selectionDeferred:true,
      efficiencyUsedForQualitySelection:false,
      selectedTeacherIdsAllowed:false,
    },
    hash,'quality_selection_rationale_hash_invalid',
  );

  const bakeoff=normalizeHsmeTeacherQualityBakeoffV1({
    schemaVersion:HSME_TEACHER_QUALITY_BAKEOFF_V1_SCHEMA,
    policy:HSME_QUALITY_POLICY_V1,
    benchmarkPolicySha256,
    fixtureSetSha256:policy.fixtureSetSha256,
    requiredCapabilities:policy.requiredCapabilities,
    candidateResults,
    selectionRationaleSha256,
  });
  const bakeoffSha256=await digest(
    HSME_TEACHER_QUALITY_BAKEOFF_CONTENT_DIGEST_DOMAIN,
    bakeoff,hash,'quality_bakeoff_hash_invalid',
  );
  const candidateManifestRefs=Object.freeze([...manifestRefs]);
  const bakeoffAssemblySha256=await digest(
    HSME_TEACHER_QUALITY_BAKEOFF_ASSEMBLY_DIGEST_DOMAIN,
    {
      schemaVersion:HSME_TEACHER_QUALITY_BAKEOFF_ASSEMBLY_V1_SCHEMA,
      benchmarkPolicySha256,
      fixtureSetSha256:policy.fixtureSetSha256,
      candidateManifestRefs,
      bakeoffSha256,
      efficiencyUsedForQualitySelection:false,
      selectedTeacherIdsAllowed:false,
      teacherAdmissionAllowed:false,
      trainingStartAllowed:false,
      providerAuthorityGranted:false,
      billingAuthorityGranted:false,
      projectArtifactMutationAllowed:false,
      aeeExecutionAuthorityGranted:false,
      durableModelFleetPromotionAllowed:false,
      winnerSelectionAllowed:false,
      productionAuthorityGranted:false,
    },
    hash,'quality_bakeoff_assembly_hash_invalid',
  );

  return Object.freeze({
    schemaVersion:HSME_TEACHER_QUALITY_BAKEOFF_ASSEMBLY_V1_SCHEMA,
    benchmarkPolicySha256,
    fixtureSetSha256:policy.fixtureSetSha256,
    candidateManifestRefs,
    bakeoffSha256,
    bakeoffAssemblySha256,
    bakeoff,
    efficiencyUsedForQualitySelection:false,
    selectedTeacherIdsAllowed:false,
    teacherAdmissionAllowed:false,
    trainingStartAllowed:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,
    winnerSelectionAllowed:false,
    productionAuthorityGranted:false,
  });
}

function normalizeOutputEvidence(raw:unknown,path:string):HsmeTeacherTargetOutputEvidenceV1{
  const record=exactRecord(raw,[
    'schemaVersion','teacherCandidateId','immutableRevision','modelContentSha256',
    'benchmarkPolicySha256','fixtureSetSha256','toolchainEvidenceSha256',
    'executionEvidenceSha256','capabilityOutputs','providerAuthorityGranted',
    'billingAuthorityGranted','projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
    'teacherAdmissionAllowed','trainingStartAllowed','productionAuthorityGranted',
  ],path);
  if(record.schemaVersion!==HSME_TEACHER_TARGET_OUTPUT_EVIDENCE_V1_SCHEMA){
    fail('quality_output_schema_invalid',`${path} schema invalid`);
  }
  for(const field of [
    'providerAuthorityGranted','billingAuthorityGranted','projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted','teacherAdmissionAllowed','trainingStartAllowed',
    'productionAuthorityGranted',
  ])requireFalse(record[field],`${path}.${field}`);
  if(!Array.isArray(record.capabilityOutputs)||record.capabilityOutputs.length<1||record.capabilityOutputs.length>CAPABILITIES.length){
    fail('quality_output_capability_count_invalid',`${path}.capabilityOutputs count invalid`);
  }
  const capabilityOutputs=record.capabilityOutputs.map((value,index)=>{
    const item=exactRecord(value,['capability','outputSetSha256'],`${path}.capabilityOutputs[${index}]`);
    return Object.freeze({
      capability:enumValue(item.capability,CAPABILITIES,`${path}.capabilityOutputs[${index}].capability`),
      outputSetSha256:sha256(item.outputSetSha256,`${path}.capabilityOutputs[${index}].outputSetSha256`),
    });
  });
  uniqueComposite(capabilityOutputs.map(value=>value.capability),'quality_output_capability_duplicate');
  return Object.freeze({
    schemaVersion:HSME_TEACHER_TARGET_OUTPUT_EVIDENCE_V1_SCHEMA,
    teacherCandidateId:identifier(record.teacherCandidateId,`${path}.teacherCandidateId`,120),
    immutableRevision:immutableRevision(record.immutableRevision,`${path}.immutableRevision`),
    modelContentSha256:sha256(record.modelContentSha256,`${path}.modelContentSha256`),
    benchmarkPolicySha256:sha256(record.benchmarkPolicySha256,`${path}.benchmarkPolicySha256`),
    fixtureSetSha256:sha256(record.fixtureSetSha256,`${path}.fixtureSetSha256`),
    toolchainEvidenceSha256:sha256(record.toolchainEvidenceSha256,`${path}.toolchainEvidenceSha256`),
    executionEvidenceSha256:sha256(record.executionEvidenceSha256,`${path}.executionEvidenceSha256`),
    capabilityOutputs:Object.freeze([...capabilityOutputs].sort((a,b)=>lexical(a.capability,b.capability))),
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    teacherAdmissionAllowed:false,
    trainingStartAllowed:false,
    productionAuthorityGranted:false,
  });
}

function normalizeAutomatedMeasurement(raw:unknown,path:string):HsmeTeacherAutomatedQualityMeasurementV1{
  const record=exactRecord(raw,[
    'schemaVersion','teacherCandidateId','capability','metricId','benchmarkPolicySha256',
    'outputSetSha256','observedMicrounits','measurementEvidenceSha256',
    'providerAuthorityGranted','billingAuthorityGranted','teacherAdmissionAllowed',
    'trainingStartAllowed','productionAuthorityGranted',
  ],path);
  if(record.schemaVersion!==HSME_TEACHER_AUTOMATED_QUALITY_MEASUREMENT_V1_SCHEMA){
    fail('quality_automated_schema_invalid',`${path} schema invalid`);
  }
  for(const field of [
    'providerAuthorityGranted','billingAuthorityGranted','teacherAdmissionAllowed',
    'trainingStartAllowed','productionAuthorityGranted',
  ])requireFalse(record[field],`${path}.${field}`);
  return Object.freeze({
    schemaVersion:HSME_TEACHER_AUTOMATED_QUALITY_MEASUREMENT_V1_SCHEMA,
    teacherCandidateId:identifier(record.teacherCandidateId,`${path}.teacherCandidateId`,120),
    capability:enumValue(record.capability,CAPABILITIES,`${path}.capability`),
    metricId:identifier(record.metricId,`${path}.metricId`,120),
    benchmarkPolicySha256:sha256(record.benchmarkPolicySha256,`${path}.benchmarkPolicySha256`),
    outputSetSha256:sha256(record.outputSetSha256,`${path}.outputSetSha256`),
    observedMicrounits:safeInteger(record.observedMicrounits,`${path}.observedMicrounits`,Number.MIN_SAFE_INTEGER,Number.MAX_SAFE_INTEGER),
    measurementEvidenceSha256:sha256(record.measurementEvidenceSha256,`${path}.measurementEvidenceSha256`),
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    teacherAdmissionAllowed:false,
    trainingStartAllowed:false,
    productionAuthorityGranted:false,
  });
}

function normalizeHumanReview(raw:unknown,path:string):HsmeTeacherBlindedHumanReviewV1{
  const record=exactRecord(raw,[
    'schemaVersion','teacherCandidateId','capability','dimensionId','benchmarkPolicySha256',
    'outputSetSha256','panelSha256','reviewEvidenceSha256','decision',
    'candidateIdentityIncluded','latencyIncluded','sizeIncluded','costIncluded',
    'providerAuthorityGranted','billingAuthorityGranted','teacherAdmissionAllowed',
    'trainingStartAllowed','productionAuthorityGranted',
  ],path);
  if(record.schemaVersion!==HSME_TEACHER_BLINDED_HUMAN_REVIEW_V1_SCHEMA){
    fail('quality_human_schema_invalid',`${path} schema invalid`);
  }
  for(const field of [
    'candidateIdentityIncluded','latencyIncluded','sizeIncluded','costIncluded',
    'providerAuthorityGranted','billingAuthorityGranted','teacherAdmissionAllowed',
    'trainingStartAllowed','productionAuthorityGranted',
  ])requireFalse(record[field],`${path}.${field}`);
  return Object.freeze({
    schemaVersion:HSME_TEACHER_BLINDED_HUMAN_REVIEW_V1_SCHEMA,
    teacherCandidateId:identifier(record.teacherCandidateId,`${path}.teacherCandidateId`,120),
    capability:enumValue(record.capability,CAPABILITIES,`${path}.capability`),
    dimensionId:identifier(record.dimensionId,`${path}.dimensionId`,120),
    benchmarkPolicySha256:sha256(record.benchmarkPolicySha256,`${path}.benchmarkPolicySha256`),
    outputSetSha256:sha256(record.outputSetSha256,`${path}.outputSetSha256`),
    panelSha256:sha256(record.panelSha256,`${path}.panelSha256`),
    reviewEvidenceSha256:sha256(record.reviewEvidenceSha256,`${path}.reviewEvidenceSha256`),
    decision:enumValue(record.decision,HUMAN_DECISIONS,`${path}.decision`),
    candidateIdentityIncluded:false,
    latencyIncluded:false,
    sizeIncluded:false,
    costIncluded:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    teacherAdmissionAllowed:false,
    trainingStartAllowed:false,
    productionAuthorityGranted:false,
  });
}

async function verifyOrigin(run:()=>Promise<boolean>):Promise<boolean>{
  try{return await run()===true;}catch{return false;}
}

async function digest(
  domain:string,
  value:unknown,
  hash:HsmeTrainingHashPortV1,
  code:string,
):Promise<string>{
  try{
    const result=await hash.sha256(new TextEncoder().encode(domain+JSON.stringify(value)));
    if(!HEX64.test(result))throw new Error('invalid hash');
    return result;
  }catch{
    fail(code,'hash port returned invalid digest');
  }
}

function exactRecord(raw:unknown,allowed:readonly string[],path:string):Record<string,unknown>{
  if(raw===null||typeof raw!=='object'||Array.isArray(raw)){
    fail('quality_record_invalid',`${path} must be an object`);
  }
  const record=raw as Record<string,unknown>;
  const keys=Object.keys(record);
  for(const key of keys)if(!allowed.includes(key))fail('quality_field_unknown',`${path}.${key} is not allowed`);
  for(const key of allowed)if(!Object.hasOwn(record,key))fail('quality_field_missing',`${path}.${key} is required`);
  return record;
}

function capabilitySet(value:unknown,path:string,min:number,max:number):readonly Capability[]{
  if(!Array.isArray(value)||value.length<min||value.length>max){
    fail('quality_capability_count_invalid',`${path} count invalid`);
  }
  const values=value.map((entry,index)=>enumValue(entry,CAPABILITIES,`${path}[${index}]`));
  uniqueComposite(values,'quality_capability_duplicate');
  return Object.freeze([...values].sort(lexical));
}

function uniqueComposite(values:readonly string[],code:string):void{
  if(new Set(values).size!==values.length)fail(code,'identifiers must be unique');
}

function evidenceKey(candidateId:string,capability:string,id:string):string{
  return `${candidateId}\0${capability}\0${id}`;
}

function requireFalse(value:unknown,path:string):void{
  if(value!==false)fail('quality_authority_widening',`${path} must remain false`);
}

function immutableRevision(value:unknown,path:string):string{
  const result=text(value,path,64);
  if(!IMMUTABLE_REVISION.test(result))fail('quality_revision_invalid',`${path} must be immutable 40/64-hex`);
  return result;
}

function sha256(value:unknown,path:string):string{
  const result=text(value,path,64);
  if(!HEX64.test(result))fail('quality_hash_invalid',`${path} must be lowercase SHA-256`);
  return result;
}

function identifier(value:unknown,path:string,max:number):string{
  const result=text(value,path,max);
  if(!IDENTIFIER.test(result))fail('quality_identifier_invalid',`${path} is invalid`);
  return result;
}

function text(value:unknown,path:string,max:number):string{
  if(typeof value!=='string'||value.length<1||value.length>max||value.trim()!==value||/[\u0000-\u001f\u007f]/.test(value)){
    fail('quality_text_invalid',`${path} is invalid`);
  }
  return value;
}

function safeInteger(value:unknown,path:string,min:number,max:number):number{
  if(!Number.isSafeInteger(value)||(value as number)<min||(value as number)>max){
    fail('quality_integer_invalid',`${path} is invalid`);
  }
  return value as number;
}

function enumValue<T extends readonly string[]>(value:unknown,values:T,path:string):T[number]{
  if(typeof value!=='string'||!(values as readonly string[]).includes(value)){
    fail('quality_enum_invalid',`${path} is invalid`);
  }
  return value as T[number];
}

function lexical(left:string,right:string):number{return left<right?-1:left>right?1:0;}

function fail(code:string,message:string):never{
  throw new HsmeTeacherQualityBakeoffAssemblyV1Error(code,message);
}
