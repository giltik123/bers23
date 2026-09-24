import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_HARDWARE_REPRESENTATION_SET_V1_SCHEMA =
  'BERS_HSME_HARDWARE_REPRESENTATION_SET_V1' as const;
export const HSME_HARDWARE_REPRESENTATION_SET_DIGEST_DOMAIN =
  'bers:hsme:hardware-representation-set:v1\0' as const;
export const HSME_HARDWARE_REPRESENTATION_QUALIFICATION_ROSTER_V1_SCHEMA =
  'BERS_HSME_HARDWARE_REPRESENTATION_QUALIFICATION_ROSTER_V1' as const;
export const HSME_HARDWARE_REPRESENTATION_QUALIFICATION_ROSTER_DIGEST_DOMAIN =
  'bers:hsme:hardware-representation-qualification-roster:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+\-]*$/;
const VERSION=/^[A-Za-z0-9][A-Za-z0-9._+\-]*$/;

export const HSME_HARDWARE_PLATFORM_FAMILIES_V1=Object.freeze([
  'APPLE',
  'ANDROID',
] as const);

export const HSME_HARDWARE_BACKENDS_V1=Object.freeze([
  'CPU',
  'GPU',
  'NPU',
] as const);

export const HSME_HARDWARE_PRECISION_TIERS_V1=Object.freeze([
  'FP32',
  'FP16',
  'BF16',
  'INT8',
  'INT4',
  'MIXED',
] as const);

export type HsmeHardwarePlatformFamilyV1=
  typeof HSME_HARDWARE_PLATFORM_FAMILIES_V1[number];
export type HsmeHardwareBackendV1=
  typeof HSME_HARDWARE_BACKENDS_V1[number];
export type HsmeHardwarePrecisionTierV1=
  typeof HSME_HARDWARE_PRECISION_TIERS_V1[number];

export type HsmeHardwareRepresentationCandidateV1=Readonly<{
  candidateId:string;
  logicalModelFamily:string;
  sourceModelContentSha256:string;
  fleetModelId:string;
  fleetVersion:string;
  representationContentSha256:string;
  representationManifestSha256:string;
  representationBytes:number;
  runtimeIdentity:string;
  formatIdentity:string;
  platformFamily:HsmeHardwarePlatformFamilyV1;
  hardwareBackend:HsmeHardwareBackendV1;
  precisionTier:HsmeHardwarePrecisionTierV1;
  supportedDeviceClass:string;
  admissibleBenchmarkPlacements:readonly HsmeHardwareBackendV1[];
  runtimeCapabilityEvidenceSha256:string;
  licenseProvenanceEvidenceSha256:string;
  immutableFleetManifestEvidenceSha256:string;
  representationReadyForBenchmark:true;
}>;

export type HsmeHardwareRepresentationSetV1=Readonly<{
  schemaVersion:typeof HSME_HARDWARE_REPRESENTATION_SET_V1_SCHEMA;
  candidates:readonly HsmeHardwareRepresentationCandidateV1[];
  reviewedBeforeBenchmark:true;
  benchmarkExecutionAllowed:false;
  representationMutationAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  fashionGeometryAuthorityGranted:false;
  aeeExecutionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export interface HsmeHardwareRepresentationSetOriginVerifierV1{
  verifyHardwareRepresentationSet(
    set:HsmeHardwareRepresentationSetV1,
    expectedSetSha256:string,
  ):Promise<boolean>;
}

export type HsmeHardwareRepresentationQualificationRosterV1=Readonly<{
  schemaVersion:
    typeof HSME_HARDWARE_REPRESENTATION_QUALIFICATION_ROSTER_V1_SCHEMA;
  state:
    |'HARDWARE_REPRESENTATION_ROSTER_INVALID'
    |'HARDWARE_REPRESENTATION_ROSTER_BLOCKED'
    |'HARDWARE_REPRESENTATION_ROSTER_FROZEN_NOT_EXECUTED';
  blockers:readonly string[];
  representationSetSha256:string|'UNKNOWN';
  candidates:readonly HsmeHardwareRepresentationCandidateV1[];
  rosterEvidenceSha256:string|'UNKNOWN';
  benchmarkExecutionAllowed:false;
  representationMutationAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  fashionGeometryAuthorityGranted:false;
  aeeExecutionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export class HsmeHardwareRepresentationQualificationRosterV1Error
  extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeHardwareRepresentationQualificationRosterV1Error';
    this.code=code;
  }
}

export function normalizeHsmeHardwareRepresentationSetV1(
  raw:unknown,
):HsmeHardwareRepresentationSetV1{
  const r=exactRecord(raw,[
    'schemaVersion',
    'candidates',
    'reviewedBeforeBenchmark',
    'benchmarkExecutionAllowed',
    'representationMutationAllowed',
    'modelInstallAllowed',
    'modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'fashionGeometryAuthorityGranted',
    'aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed',
  ],'set');
  if(r.schemaVersion!==HSME_HARDWARE_REPRESENTATION_SET_V1_SCHEMA){
    fail(
      'hsme_hardware_representation_set_schema',
      'hardware representation set schema unsupported',
    );
  }
  if(r.reviewedBeforeBenchmark!==true){
    fail(
      'hsme_hardware_representation_set_review',
      'reviewedBeforeBenchmark must be true',
    );
  }
  assertNoAuthority(r,'set');
  if(
    !Array.isArray(r.candidates)
    ||r.candidates.length<2
    ||r.candidates.length>16
  ){
    fail(
      'hsme_hardware_representation_set_candidates',
      'hardware representation candidate cardinality must be 2..16',
    );
  }

  const candidates=r.candidates.map((value,index)=>
    normalizeCandidate(
      value,
      'set.candidates['+index+']',
    )
  ).sort(compareCandidates);

  assertUnique(
    candidates.map(value=>value.candidateId),
    'candidateId',
  );
  assertUnique(
    candidates.map(value=>
      value.fleetModelId+'\0'+value.fleetVersion
    ),
    'fleet modelId@version',
  );
  assertUnique(
    candidates.map(value=>value.representationContentSha256),
    'representation content hash',
  );

  return deepFreeze({
    schemaVersion:HSME_HARDWARE_REPRESENTATION_SET_V1_SCHEMA,
    candidates:Object.freeze(candidates),
    reviewedBeforeBenchmark:true,
    ...authorityBoundary(),
  });
}

export async function hsmeHardwareRepresentationSetV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_HARDWARE_REPRESENTATION_SET_DIGEST_DOMAIN,
    normalizeHsmeHardwareRepresentationSetV1(raw),
    hash,
  );
}

export async function freezeHsmeHardwareRepresentationQualificationRosterV1(
  rawSet:unknown,
  expectedSetSha256:string,
  origin:HsmeHardwareRepresentationSetOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeHardwareRepresentationQualificationRosterV1>{
  let set:HsmeHardwareRepresentationSetV1;
  let setSha256:string;
  try{
    set=normalizeHsmeHardwareRepresentationSetV1(rawSet);
    setSha256=await hsmeHardwareRepresentationSetV1Digest(set,hash);
  }catch{
    return invalid([
      'HARDWARE_REPRESENTATION_SET_INVALID',
    ]);
  }

  const common={representationSetSha256:setSha256};
  if(
    !HEX64.test(expectedSetSha256)
    ||expectedSetSha256!==setSha256
  ){
    return invalid(
      ['HARDWARE_REPRESENTATION_SET_DIGEST_MISMATCH'],
      common,
    );
  }
  if(!await verify(
    ()=>origin.verifyHardwareRepresentationSet(set,setSha256),
  )){
    return invalid(
      ['HARDWARE_REPRESENTATION_SET_ORIGIN_UNVERIFIED'],
      common,
    );
  }

  const payload={
    schemaVersion:
      HSME_HARDWARE_REPRESENTATION_QUALIFICATION_ROSTER_V1_SCHEMA,
    state:
      'HARDWARE_REPRESENTATION_ROSTER_FROZEN_NOT_EXECUTED' as const,
    blockers:Object.freeze([] as string[]),
    representationSetSha256:setSha256,
    candidates:set.candidates,
    ...authorityBoundary(),
  };
  const rosterEvidenceSha256=await digest(
    HSME_HARDWARE_REPRESENTATION_QUALIFICATION_ROSTER_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({
    ...payload,
    rosterEvidenceSha256,
  });
}

export async function hsmeHardwareRepresentationQualificationRosterV1Digest(
  value:HsmeHardwareRepresentationQualificationRosterV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    value.state!==
      'HARDWARE_REPRESENTATION_ROSTER_FROZEN_NOT_EXECUTED'
    ||value.rosterEvidenceSha256==='UNKNOWN'
  ){
    fail(
      'hsme_hardware_representation_roster_digest_state',
      'only FROZEN_NOT_EXECUTED roster is digestible',
    );
  }
  const {rosterEvidenceSha256:_ignored,...payload}=value;
  return digest(
    HSME_HARDWARE_REPRESENTATION_QUALIFICATION_ROSTER_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

function normalizeCandidate(
  raw:unknown,
  path:string,
):HsmeHardwareRepresentationCandidateV1{
  const r=exactRecord(raw,[
    'candidateId',
    'logicalModelFamily',
    'sourceModelContentSha256',
    'fleetModelId',
    'fleetVersion',
    'representationContentSha256',
    'representationManifestSha256',
    'representationBytes',
    'runtimeIdentity',
    'formatIdentity',
    'platformFamily',
    'hardwareBackend',
    'precisionTier',
    'supportedDeviceClass',
    'admissibleBenchmarkPlacements',
    'runtimeCapabilityEvidenceSha256',
    'licenseProvenanceEvidenceSha256',
    'immutableFleetManifestEvidenceSha256',
    'representationReadyForBenchmark',
  ],path);

  if(r.representationReadyForBenchmark!==true){
    fail(
      'hsme_hardware_representation_candidate_review',
      path+'.representationReadyForBenchmark must be true',
    );
  }

  const hardwareBackend=enumValue(
    r.hardwareBackend,
    HSME_HARDWARE_BACKENDS_V1,
    path+'.hardwareBackend',
  );
  const admissibleBenchmarkPlacements=enumSet(
    r.admissibleBenchmarkPlacements,
    HSME_HARDWARE_BACKENDS_V1,
    path+'.admissibleBenchmarkPlacements',
    1,
    HSME_HARDWARE_BACKENDS_V1.length,
  ).sort(
    (a,b)=>
      HSME_HARDWARE_BACKENDS_V1.indexOf(a)
      -HSME_HARDWARE_BACKENDS_V1.indexOf(b),
  );
  if(!admissibleBenchmarkPlacements.includes(hardwareBackend)){
    fail(
      'hsme_hardware_representation_candidate_placement',
      path+' primary hardwareBackend must be benchmark-admissible',
    );
  }

  return deepFreeze({
    candidateId:identifier(
      r.candidateId,
      path+'.candidateId',
      160,
    ),
    logicalModelFamily:identifier(
      r.logicalModelFamily,
      path+'.logicalModelFamily',
      160,
    ),
    sourceModelContentSha256:sha256(
      r.sourceModelContentSha256,
      path+'.sourceModelContentSha256',
    ),
    fleetModelId:identifier(
      r.fleetModelId,
      path+'.fleetModelId',
      160,
    ),
    fleetVersion:version(
      r.fleetVersion,
      path+'.fleetVersion',
      100,
    ),
    representationContentSha256:sha256(
      r.representationContentSha256,
      path+'.representationContentSha256',
    ),
    representationManifestSha256:sha256(
      r.representationManifestSha256,
      path+'.representationManifestSha256',
    ),
    representationBytes:safeInteger(
      r.representationBytes,
      path+'.representationBytes',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    runtimeIdentity:identifier(
      r.runtimeIdentity,
      path+'.runtimeIdentity',
      160,
    ),
    formatIdentity:identifier(
      r.formatIdentity,
      path+'.formatIdentity',
      160,
    ),
    platformFamily:enumValue(
      r.platformFamily,
      HSME_HARDWARE_PLATFORM_FAMILIES_V1,
      path+'.platformFamily',
    ),
    hardwareBackend,
    precisionTier:enumValue(
      r.precisionTier,
      HSME_HARDWARE_PRECISION_TIERS_V1,
      path+'.precisionTier',
    ),
    supportedDeviceClass:identifier(
      r.supportedDeviceClass,
      path+'.supportedDeviceClass',
      160,
    ),
    admissibleBenchmarkPlacements:
      Object.freeze(admissibleBenchmarkPlacements),
    runtimeCapabilityEvidenceSha256:sha256(
      r.runtimeCapabilityEvidenceSha256,
      path+'.runtimeCapabilityEvidenceSha256',
    ),
    licenseProvenanceEvidenceSha256:sha256(
      r.licenseProvenanceEvidenceSha256,
      path+'.licenseProvenanceEvidenceSha256',
    ),
    immutableFleetManifestEvidenceSha256:sha256(
      r.immutableFleetManifestEvidenceSha256,
      path+'.immutableFleetManifestEvidenceSha256',
    ),
    representationReadyForBenchmark:true,
  });
}

type PartialOutput=Partial<Pick<
  HsmeHardwareRepresentationQualificationRosterV1,
  'representationSetSha256'
>>;

function invalid(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeHardwareRepresentationQualificationRosterV1{
  return terminal(
    'HARDWARE_REPRESENTATION_ROSTER_INVALID',
    blockers,
    values,
  );
}

function terminal(
  state:
    |'HARDWARE_REPRESENTATION_ROSTER_INVALID'
    |'HARDWARE_REPRESENTATION_ROSTER_BLOCKED',
  blockers:readonly string[],
  values:PartialOutput,
):HsmeHardwareRepresentationQualificationRosterV1{
  return deepFreeze({
    schemaVersion:
      HSME_HARDWARE_REPRESENTATION_QUALIFICATION_ROSTER_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    representationSetSha256:
      values.representationSetSha256??'UNKNOWN',
    candidates:Object.freeze([]),
    rosterEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function authorityBoundary(){
  return Object.freeze({
    benchmarkExecutionAllowed:false as const,
    representationMutationAllowed:false as const,
    modelInstallAllowed:false as const,
    modelFleetPromotionAllowed:false as const,
    durableModelFleetPromotionAllowed:false as const,
    productionAuthorityGranted:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    projectArtifactMutationAllowed:false as const,
    fashionGeometryAuthorityGranted:false as const,
    aeeExecutionAuthorityGranted:false as const,
    winnerSelectionAllowed:false as const,
  });
}

function assertNoAuthority(
  record:Record<string,unknown>,
  path:string,
):void{
  for(const field of Object.keys(authorityBoundary())){
    if(record[field]!==false){
      fail(
        'hsme_hardware_representation_authority',
        path+'.'+field+' must remain false',
      );
    }
  }
}

function compareCandidates(
  a:HsmeHardwareRepresentationCandidateV1,
  b:HsmeHardwareRepresentationCandidateV1,
):number{
  return lexical(
    [
      a.candidateId,
      a.fleetModelId,
      a.fleetVersion,
      a.runtimeIdentity,
      a.formatIdentity,
      a.hardwareBackend,
    ].join('\0'),
    [
      b.candidateId,
      b.fleetModelId,
      b.fleetVersion,
      b.runtimeIdentity,
      b.formatIdentity,
      b.hardwareBackend,
    ].join('\0'),
  );
}

function assertUnique(
  values:readonly string[],
  label:string,
):void{
  if(new Set(values).size!==values.length){
    fail(
      'hsme_hardware_representation_identity',
      label+' must be unique',
    );
  }
}

function enumSet<T extends readonly string[]>(
  raw:unknown,
  allowed:T,
  path:string,
  min:number,
  max:number,
):T[number][]{
  if(!Array.isArray(raw)||raw.length<min||raw.length>max){
    fail(
      'hsme_hardware_representation_value',
      path+' cardinality invalid',
    );
  }
  const values=raw.map((value,index)=>
    enumValue(
      value,
      allowed,
      path+'['+index+']',
    )
  );
  if(new Set(values).size!==values.length){
    fail(
      'hsme_hardware_representation_value',
      path+' contains duplicates',
    );
  }
  return values;
}

function exactRecord(
  raw:unknown,
  fields:readonly string[],
  path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail(
      'hsme_hardware_representation_schema',
      path+' must be an object',
    );
  }
  const proto=Object.getPrototypeOf(raw);
  if(proto!==Object.prototype&&proto!==null){
    fail(
      'hsme_hardware_representation_schema',
      path+' must be a plain object',
    );
  }
  const r=raw as Record<string,unknown>;
  const keys=Object.keys(r);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(r,key))
  ){
    fail(
      'hsme_hardware_representation_schema',
      path+' contains unknown or missing fields',
    );
  }
  return r;
}

function enumValue<T extends readonly string[]>(
  raw:unknown,
  values:T,
  path:string,
):T[number]{
  if(
    typeof raw!=='string'
    ||!(values as readonly string[]).includes(raw)
  ){
    fail(
      'hsme_hardware_representation_value',
      path+' is unsupported',
    );
  }
  return raw as T[number];
}

function identifier(
  raw:unknown,
  path:string,
  max:number,
):string{
  const value=boundedString(raw,path,max);
  if(!IDENTIFIER.test(value)){
    fail(
      'hsme_hardware_representation_value',
      path+' must be an identifier',
    );
  }
  return value;
}

function version(
  raw:unknown,
  path:string,
  max:number,
):string{
  const value=boundedString(raw,path,max);
  if(!VERSION.test(value)){
    fail(
      'hsme_hardware_representation_value',
      path+' must be a version identifier',
    );
  }
  return value;
}

function sha256(
  raw:unknown,
  path:string,
):string{
  const value=boundedString(raw,path,64);
  if(!HEX64.test(value)){
    fail(
      'hsme_hardware_representation_value',
      path+' must be lowercase SHA-256',
    );
  }
  return value;
}

function boundedString(
  raw:unknown,
  path:string,
  max:number,
):string{
  if(typeof raw!=='string'){
    fail(
      'hsme_hardware_representation_value',
      path+' must be a string',
    );
  }
  const value=raw.trim();
  if(
    value.length<1
    ||value.length>max
    ||/[\u0000-\u001f\u007f]/.test(value)
  ){
    fail(
      'hsme_hardware_representation_value',
      path+' is invalid',
    );
  }
  return value;
}

function safeInteger(
  raw:unknown,
  path:string,
  min:number,
  max:number,
):number{
  if(
    !Number.isSafeInteger(raw)
    ||(raw as number)<min
    ||(raw as number)>max
  ){
    fail(
      'hsme_hardware_representation_value',
      path+' must be a bounded safe integer',
    );
  }
  return raw as number;
}

async function digest(
  domain:string,
  value:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const result=await hash.sha256(
    new TextEncoder().encode(domain+JSON.stringify(value)),
  );
  if(!HEX64.test(result)){
    fail(
      'hsme_hardware_representation_hash',
      'hash port must return lowercase SHA-256',
    );
  }
  return result;
}

async function verify(
  run:()=>Promise<boolean>,
):Promise<boolean>{
  try{
    return await run()===true;
  }catch{
    return false;
  }
}

function lexical(a:string,b:string):number{
  return a<b?-1:a>b?1:0;
}

function deepFreeze<T>(value:T):T{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(
      value as Record<string,unknown>,
    )){
      deepFreeze(child);
    }
  }
  return value;
}

function fail(
  code:string,
  message:string,
):never{
  throw new HsmeHardwareRepresentationQualificationRosterV1Error(
    code,
    message,
  );
}
