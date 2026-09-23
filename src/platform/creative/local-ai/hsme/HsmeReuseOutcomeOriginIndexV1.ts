export const HSME_REUSE_OUTCOME_ORIGIN_INDEX_V1_SCHEMA =
  'BERS_HSME_REUSE_OUTCOME_ORIGIN_INDEX_V1' as const;
export const HSME_REUSE_OUTCOME_ORIGIN_INDEX_DIGEST_DOMAIN =
  'bers:hsme:reuse-outcome-origin-index:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[a-z0-9][a-z0-9._:@/-]*$/;

export type HsmeReuseOutcomeOriginIndexCandidateAssemblyV1=Readonly<{
  candidateId:string;
  fileSha256:string;
  candidateEvidenceSetSha256:string|'UNKNOWN';
}>;

export type HsmeReuseOutcomeOriginIndexV1=Readonly<{
  schemaVersion:typeof HSME_REUSE_OUTCOME_ORIGIN_INDEX_V1_SCHEMA;
  sourceDecisionFileSha256:string;
  campaignFileSha256:string;
  candidateAssemblies:readonly HsmeReuseOutcomeOriginIndexCandidateAssemblyV1[];
  qualityFrontier:Readonly<{
    fileSha256:string;
    qualityFrontierSha256:string;
  }>;
  paretoEfficiency:Readonly<{
    fileSha256:string;
    paretoEvidenceSha256:string;
  }>;
  trainingRunStartAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  durableModelFleetPromotionAllowed:false;
  winnerSelectionAllowed:false;
}>;

export interface HsmeReuseOutcomeOriginIndexHashPortV1{
  sha256(bytes:Uint8Array):Promise<string>;
}

export class HsmeReuseOutcomeOriginIndexV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeReuseOutcomeOriginIndexV1Error';
    this.code=code;
  }
}

export function normalizeHsmeReuseOutcomeOriginIndexV1(
  raw:unknown,
):HsmeReuseOutcomeOriginIndexV1{
  const record=exactRecord(raw,[
    'schemaVersion',
    'sourceDecisionFileSha256',
    'campaignFileSha256',
    'candidateAssemblies',
    'qualityFrontier',
    'paretoEfficiency',
    'trainingRunStartAllowed',
    'modelInstallAllowed',
    'modelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'durableModelFleetPromotionAllowed',
    'winnerSelectionAllowed',
  ],'originIndex');

  if(record.schemaVersion!==HSME_REUSE_OUTCOME_ORIGIN_INDEX_V1_SCHEMA){
    fail(
      'hsme_reuse_materialization_origin_schema_invalid',
      'origin index schema invalid',
    );
  }
  if(!Array.isArray(record.candidateAssemblies)||record.candidateAssemblies.length>16){
    fail(
      'hsme_reuse_materialization_origin_assembly_count_invalid',
      'origin index candidateAssemblies must contain 0..16 entries',
    );
  }

  const candidateAssemblies=record.candidateAssemblies.map((rawEntry,index)=>{
    const entry=exactRecord(rawEntry,[
      'candidateId',
      'fileSha256',
      'candidateEvidenceSetSha256',
    ],`originIndex.candidateAssemblies[${index}]`);
    return Object.freeze({
      candidateId:identifier(
        entry.candidateId,
        `candidateAssemblies[${index}].candidateId`,
        120,
      ),
      fileSha256:sha256(
        entry.fileSha256,
        `candidateAssemblies[${index}].fileSha256`,
      ),
      candidateEvidenceSetSha256:digestOrUnknown(
        entry.candidateEvidenceSetSha256,
        `candidateAssemblies[${index}].candidateEvidenceSetSha256`,
      ),
    });
  }).sort((a,b)=>lexical(a.candidateId,b.candidateId));

  if(new Set(candidateAssemblies.map(value=>value.candidateId)).size!==candidateAssemblies.length){
    fail(
      'hsme_reuse_materialization_origin_assembly_duplicate',
      'origin index candidate ids must be unique',
    );
  }

  const frontierRecord=exactRecord(
    record.qualityFrontier,
    ['fileSha256','qualityFrontierSha256'],
    'originIndex.qualityFrontier',
  );
  const paretoRecord=exactRecord(
    record.paretoEfficiency,
    ['fileSha256','paretoEvidenceSha256'],
    'originIndex.paretoEfficiency',
  );

  return Object.freeze({
    schemaVersion:HSME_REUSE_OUTCOME_ORIGIN_INDEX_V1_SCHEMA,
    sourceDecisionFileSha256:sha256(
      record.sourceDecisionFileSha256,
      'originIndex.sourceDecisionFileSha256',
    ),
    campaignFileSha256:sha256(
      record.campaignFileSha256,
      'originIndex.campaignFileSha256',
    ),
    candidateAssemblies:Object.freeze(candidateAssemblies),
    qualityFrontier:Object.freeze({
      fileSha256:sha256(
        frontierRecord.fileSha256,
        'originIndex.qualityFrontier.fileSha256',
      ),
      qualityFrontierSha256:sha256(
        frontierRecord.qualityFrontierSha256,
        'originIndex.qualityFrontier.qualityFrontierSha256',
      ),
    }),
    paretoEfficiency:Object.freeze({
      fileSha256:sha256(
        paretoRecord.fileSha256,
        'originIndex.paretoEfficiency.fileSha256',
      ),
      paretoEvidenceSha256:sha256(
        paretoRecord.paretoEvidenceSha256,
        'originIndex.paretoEfficiency.paretoEvidenceSha256',
      ),
    }),
    trainingRunStartAllowed:falseValue(
      record.trainingRunStartAllowed,
      'originIndex.trainingRunStartAllowed',
    ),
    modelInstallAllowed:falseValue(
      record.modelInstallAllowed,
      'originIndex.modelInstallAllowed',
    ),
    modelFleetPromotionAllowed:falseValue(
      record.modelFleetPromotionAllowed,
      'originIndex.modelFleetPromotionAllowed',
    ),
    productionAuthorityGranted:falseValue(
      record.productionAuthorityGranted,
      'originIndex.productionAuthorityGranted',
    ),
    providerAuthorityGranted:falseValue(
      record.providerAuthorityGranted,
      'originIndex.providerAuthorityGranted',
    ),
    billingAuthorityGranted:falseValue(
      record.billingAuthorityGranted,
      'originIndex.billingAuthorityGranted',
    ),
    projectArtifactMutationAllowed:falseValue(
      record.projectArtifactMutationAllowed,
      'originIndex.projectArtifactMutationAllowed',
    ),
    aeeExecutionAuthorityGranted:falseValue(
      record.aeeExecutionAuthorityGranted,
      'originIndex.aeeExecutionAuthorityGranted',
    ),
    durableModelFleetPromotionAllowed:falseValue(
      record.durableModelFleetPromotionAllowed,
      'originIndex.durableModelFleetPromotionAllowed',
    ),
    winnerSelectionAllowed:falseValue(
      record.winnerSelectionAllowed,
      'originIndex.winnerSelectionAllowed',
    ),
  });
}

export async function hsmeReuseOutcomeOriginIndexV1Digest(
  raw:unknown,
  hash:HsmeReuseOutcomeOriginIndexHashPortV1,
):Promise<string>{
  const normalized=normalizeHsmeReuseOutcomeOriginIndexV1(raw);
  const canonical=JSON.stringify(canonicalValue(normalized));
  const digest=await hash.sha256(new TextEncoder().encode(
    HSME_REUSE_OUTCOME_ORIGIN_INDEX_DIGEST_DOMAIN+canonical,
  ));
  if(!HEX64.test(digest)){
    fail(
      'hsme_reuse_materialization_hash_invalid',
      'origin index hash port must return lowercase SHA-256',
    );
  }
  return digest;
}

function exactRecord(
  raw:unknown,
  allowed:readonly string[],
  path:string,
):Record<string,unknown>{
  if(raw===null||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_reuse_materialization_record_invalid',path+' must be an object');
  }
  const record=raw as Record<string,unknown>;
  for(const key of Object.keys(record)){
    if(!allowed.includes(key)){
      fail(
        'hsme_reuse_materialization_field_unknown',
        path+'.'+key+' is not allowed',
      );
    }
  }
  for(const key of allowed){
    if(!Object.hasOwn(record,key)){
      fail(
        'hsme_reuse_materialization_field_missing',
        path+'.'+key+' is required',
      );
    }
  }
  return record;
}

function text(value:unknown,path:string,max:number):string{
  if(
    typeof value!=='string'
    ||value.length<1
    ||value.length>max
    ||value.trim()!==value
    ||/[\u0000-\u001f\u007f]/.test(value)
  ){
    fail('hsme_reuse_materialization_text_invalid',path+' is invalid');
  }
  return value;
}

function identifier(value:unknown,path:string,max=160):string{
  const result=text(value,path,max);
  if(!IDENTIFIER.test(result)){
    fail('hsme_reuse_materialization_identifier_invalid',path+' is invalid');
  }
  return result;
}

function sha256(value:unknown,path:string):string{
  const result=text(value,path,64);
  if(!HEX64.test(result)){
    fail(
      'hsme_reuse_materialization_hash_invalid',
      path+' must be lowercase SHA-256',
    );
  }
  return result;
}

function digestOrUnknown(value:unknown,path:string):string|'UNKNOWN'{
  if(value==='UNKNOWN')return value;
  return sha256(value,path);
}

function falseValue(value:unknown,path:string):false{
  if(value!==false){
    fail('hsme_reuse_materialization_authority_invalid',path+' must remain false');
  }
  return false;
}

function canonicalValue(value:unknown):unknown{
  if(Array.isArray(value))return value.map(canonicalValue);
  if(value&&typeof value==='object'){
    const record=value as Record<string,unknown>;
    return Object.fromEntries(
      Object.keys(record).sort(lexical).map(key=>[key,canonicalValue(record[key])]),
    );
  }
  return value;
}

function lexical(left:string,right:string):number{
  return left<right?-1:left>right?1:0;
}

function fail(code:string,message:string):never{
  throw new HsmeReuseOutcomeOriginIndexV1Error(code,message);
}
