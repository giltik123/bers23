import type {
  SignaturePort,
} from '../../../src/platform/creative/local-ai/types.ts';
import type {
  HsmeFoundationPhysicalMobileRunAttestationV1,
  HsmeFoundationPhysicalMobileRunTrustPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeFoundationPhysicalMobileValidationEvidenceV1.ts';
import type {
  HsmeNativeMobileEnergyThermalEvidenceRecordV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeNativeMobileEnergyThermalEvidenceV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';
import type {
  HsmeNativeMobileEnergyThermalOriginVerifierV1,
} from './HsmeRealMobilePhysicalEvidenceOriginV1.ts';

export const HSME_FOUNDATION_PHYSICAL_DETACHED_SIGNATURE_MATERIAL_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_PHYSICAL_DETACHED_SIGNATURE_MATERIAL_V1' as const;
export const HSME_FOUNDATION_PHYSICAL_DETACHED_SIGNATURE_MATERIAL_DIGEST_DOMAIN =
  'bers:hsme:foundation-physical-detached-signature-material:v1\0' as const;
export const HSME_NATIVE_TELEMETRY_DETACHED_SIGNATURE_MATERIAL_V1_SCHEMA =
  'BERS_HSME_NATIVE_TELEMETRY_DETACHED_SIGNATURE_MATERIAL_V1' as const;
export const HSME_NATIVE_TELEMETRY_DETACHED_SIGNATURE_MATERIAL_DIGEST_DOMAIN =
  'bers:hsme:native-telemetry-detached-signature-material:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+\-]*$/;
const HTTPS_URL=/^https:\/\/[^\s]+$/;

export type HsmeFoundationPhysicalDetachedSignatureMaterialV1=Readonly<{
  schemaVersion:
    typeof HSME_FOUNDATION_PHYSICAL_DETACHED_SIGNATURE_MATERIAL_V1_SCHEMA;
  evidenceUrl:string;
  signatureUrl:string;
  verificationKeyId:string;
  canonicalPayloadSha256:string;
  signature:string;
  signatureAlgorithmId:string;
  signedAtMs:number;
  signatureMaterialSha256:string;
}>;

export type HsmeNativeTelemetryDetachedSignatureMaterialV1=Readonly<{
  schemaVersion:
    typeof HSME_NATIVE_TELEMETRY_DETACHED_SIGNATURE_MATERIAL_V1_SCHEMA;
  telemetryEvidenceSha256:string;
  deviceRunSessionSha256:string;
  deviceCapabilityKey:string;
  supportedDeviceClass:string;
  actualPlacement:'CPU'|'GPU'|'NPU';
  verificationKeyId:string;
  signature:string;
  signatureAlgorithmId:string;
  signedAtMs:number;
  signatureMaterialSha256:string;
}>;

export interface HsmeOfflinePhysicalSignatureMaterialResolverV1{
  resolveFoundationPhysicalSignature(
    attestation:HsmeFoundationPhysicalMobileRunAttestationV1,
  ):Promise<unknown>;
  resolveNativeTelemetrySignature(
    nativeTelemetryAttestationSha256:string,
  ):Promise<unknown>;
}

export type HsmeOfflinePhysicalEvidenceTrustConfigV1=Readonly<{
  foundationVerificationKeyId:string;
  nativeTelemetryVerificationKeyId:string;
  signatureAlgorithmId:string;
}>;

export class HsmeOfflinePhysicalEvidenceTrustV1
  implements
    HsmeFoundationPhysicalMobileRunTrustPortV1,
    HsmeNativeMobileEnergyThermalOriginVerifierV1{
  readonly #config:HsmeOfflinePhysicalEvidenceTrustConfigV1;

  constructor(
    private readonly resolver:
      HsmeOfflinePhysicalSignatureMaterialResolverV1,
    private readonly signatures:SignaturePort,
    private readonly hash:HsmeDenseBaselineHashPortV1,
    config:HsmeOfflinePhysicalEvidenceTrustConfigV1,
  ){
    this.#config=deepFreeze({
      foundationVerificationKeyId:identifier(
        config.foundationVerificationKeyId,
        'config.foundationVerificationKeyId',
        160,
      ),
      nativeTelemetryVerificationKeyId:identifier(
        config.nativeTelemetryVerificationKeyId,
        'config.nativeTelemetryVerificationKeyId',
        160,
      ),
      signatureAlgorithmId:identifier(
        config.signatureAlgorithmId,
        'config.signatureAlgorithmId',
        100,
      ),
    });
  }

  async verifyPhysicalRunEvidence(
    attestation:HsmeFoundationPhysicalMobileRunAttestationV1,
    canonicalPayload:string,
  ):Promise<boolean>{
    try{
      const material=normalizeFoundationMaterial(
        await this.resolver.resolveFoundationPhysicalSignature(
          attestation,
        ),
      );
      if(
        material.evidenceUrl!==attestation.evidenceUrl
        ||material.signatureUrl!==attestation.signatureUrl
        ||material.verificationKeyId!==attestation.verificationKeyId
        ||material.verificationKeyId!==
          this.#config.foundationVerificationKeyId
        ||material.signatureAlgorithmId!==
          this.#config.signatureAlgorithmId
      ){
        return false;
      }

      const canonicalPayloadSha256=await hashText(
        canonicalPayload,
        this.hash,
      );
      if(
        material.canonicalPayloadSha256!==canonicalPayloadSha256
      ){
        return false;
      }

      const materialSha256=await foundationMaterialDigest(
        material,
        this.hash,
      );
      if(material.signatureMaterialSha256!==materialSha256){
        return false;
      }

      return await safeVerify(
        this.signatures,
        material.verificationKeyId,
        material.signature,
        canonicalPayloadSha256,
      );
    }catch{
      return false;
    }
  }

  async verifyNativeMobileEnergyThermalEvidence(
    record:HsmeNativeMobileEnergyThermalEvidenceRecordV1,
    expectedEvidenceSha256:string,
  ):Promise<boolean>{
    try{
      if(
        !HEX64.test(expectedEvidenceSha256)
        ||record.evidenceSha256!==expectedEvidenceSha256
      ){
        return false;
      }
      const recomputedEvidenceSha256=await digest(
        'bers:hsme:native-mobile-energy-thermal-evidence:v1\0',
        record.evidence,
        this.hash,
      );
      if(recomputedEvidenceSha256!==expectedEvidenceSha256){
        return false;
      }

      const material=normalizeNativeMaterial(
        await this.resolver.resolveNativeTelemetrySignature(
          record.evidence.nativeTelemetryAttestationSha256,
        ),
      );

      const materialSha256=await nativeMaterialDigest(
        material,
        this.hash,
      );
      if(
        material.signatureMaterialSha256!==materialSha256
        ||record.evidence.nativeTelemetryAttestationSha256!==
          materialSha256
        ||material.telemetryEvidenceSha256!==expectedEvidenceSha256
        ||material.deviceRunSessionSha256!==
          record.evidence.deviceRunSessionSha256
        ||material.deviceCapabilityKey!==
          record.evidence.deviceCapabilityKey
        ||material.supportedDeviceClass!==
          record.evidence.supportedDeviceClass
        ||material.actualPlacement!==record.evidence.actualPlacement
        ||material.verificationKeyId!==
          this.#config.nativeTelemetryVerificationKeyId
        ||material.signatureAlgorithmId!==
          this.#config.signatureAlgorithmId
      ){
        return false;
      }

      return await safeVerify(
        this.signatures,
        material.verificationKeyId,
        material.signature,
        expectedEvidenceSha256,
      );
    }catch{
      return false;
    }
  }
}

export async function hsmeFoundationPhysicalDetachedSignatureMaterialV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return foundationMaterialDigest(
    normalizeFoundationMaterial(raw),
    hash,
  );
}

export async function hsmeNativeTelemetryDetachedSignatureMaterialV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return nativeMaterialDigest(
    normalizeNativeMaterial(raw),
    hash,
  );
}

function normalizeFoundationMaterial(
  raw:unknown,
):HsmeFoundationPhysicalDetachedSignatureMaterialV1{
  const r=exactRecord(raw,[
    'schemaVersion',
    'evidenceUrl',
    'signatureUrl',
    'verificationKeyId',
    'canonicalPayloadSha256',
    'signature',
    'signatureAlgorithmId',
    'signedAtMs',
    'signatureMaterialSha256',
  ],'foundationMaterial');
  if(
    r.schemaVersion!==
      HSME_FOUNDATION_PHYSICAL_DETACHED_SIGNATURE_MATERIAL_V1_SCHEMA
  ){
    fail(
      'hsme_offline_physical_foundation_schema',
      'foundation detached signature schema unsupported',
    );
  }
  return deepFreeze({
    schemaVersion:
      HSME_FOUNDATION_PHYSICAL_DETACHED_SIGNATURE_MATERIAL_V1_SCHEMA,
    evidenceUrl:httpsUrl(
      r.evidenceUrl,
      'foundationMaterial.evidenceUrl',
    ),
    signatureUrl:httpsUrl(
      r.signatureUrl,
      'foundationMaterial.signatureUrl',
    ),
    verificationKeyId:identifier(
      r.verificationKeyId,
      'foundationMaterial.verificationKeyId',
      160,
    ),
    canonicalPayloadSha256:sha256(
      r.canonicalPayloadSha256,
      'foundationMaterial.canonicalPayloadSha256',
    ),
    signature:boundedString(
      r.signature,
      'foundationMaterial.signature',
      4096,
    ),
    signatureAlgorithmId:identifier(
      r.signatureAlgorithmId,
      'foundationMaterial.signatureAlgorithmId',
      100,
    ),
    signedAtMs:safeInteger(
      r.signedAtMs,
      'foundationMaterial.signedAtMs',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    signatureMaterialSha256:sha256(
      r.signatureMaterialSha256,
      'foundationMaterial.signatureMaterialSha256',
    ),
  });
}

function normalizeNativeMaterial(
  raw:unknown,
):HsmeNativeTelemetryDetachedSignatureMaterialV1{
  const r=exactRecord(raw,[
    'schemaVersion',
    'telemetryEvidenceSha256',
    'deviceRunSessionSha256',
    'deviceCapabilityKey',
    'supportedDeviceClass',
    'actualPlacement',
    'verificationKeyId',
    'signature',
    'signatureAlgorithmId',
    'signedAtMs',
    'signatureMaterialSha256',
  ],'nativeMaterial');
  if(
    r.schemaVersion!==
      HSME_NATIVE_TELEMETRY_DETACHED_SIGNATURE_MATERIAL_V1_SCHEMA
  ){
    fail(
      'hsme_offline_physical_native_schema',
      'native detached signature schema unsupported',
    );
  }
  return deepFreeze({
    schemaVersion:
      HSME_NATIVE_TELEMETRY_DETACHED_SIGNATURE_MATERIAL_V1_SCHEMA,
    telemetryEvidenceSha256:sha256(
      r.telemetryEvidenceSha256,
      'nativeMaterial.telemetryEvidenceSha256',
    ),
    deviceRunSessionSha256:sha256(
      r.deviceRunSessionSha256,
      'nativeMaterial.deviceRunSessionSha256',
    ),
    deviceCapabilityKey:sha256(
      r.deviceCapabilityKey,
      'nativeMaterial.deviceCapabilityKey',
    ),
    supportedDeviceClass:identifier(
      r.supportedDeviceClass,
      'nativeMaterial.supportedDeviceClass',
      160,
    ),
    actualPlacement:enumValue(
      r.actualPlacement,
      ['CPU','GPU','NPU'] as const,
      'nativeMaterial.actualPlacement',
    ),
    verificationKeyId:identifier(
      r.verificationKeyId,
      'nativeMaterial.verificationKeyId',
      160,
    ),
    signature:boundedString(
      r.signature,
      'nativeMaterial.signature',
      4096,
    ),
    signatureAlgorithmId:identifier(
      r.signatureAlgorithmId,
      'nativeMaterial.signatureAlgorithmId',
      100,
    ),
    signedAtMs:safeInteger(
      r.signedAtMs,
      'nativeMaterial.signedAtMs',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    signatureMaterialSha256:sha256(
      r.signatureMaterialSha256,
      'nativeMaterial.signatureMaterialSha256',
    ),
  });
}

async function foundationMaterialDigest(
  material:HsmeFoundationPhysicalDetachedSignatureMaterialV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const {signatureMaterialSha256:_ignored,...payload}=material;
  return digest(
    HSME_FOUNDATION_PHYSICAL_DETACHED_SIGNATURE_MATERIAL_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

async function nativeMaterialDigest(
  material:HsmeNativeTelemetryDetachedSignatureMaterialV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const {signatureMaterialSha256:_ignored,...payload}=material;
  return digest(
    HSME_NATIVE_TELEMETRY_DETACHED_SIGNATURE_MATERIAL_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

async function safeVerify(
  signatures:SignaturePort,
  verificationKeyId:string,
  signature:string,
  digestValue:string,
):Promise<boolean>{
  try{
    return await signatures.verify(
      verificationKeyId,
      signature,
      digestValue,
    )===true;
  }catch{
    return false;
  }
}

async function hashText(
  value:string,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const result=await hash.sha256(
    new TextEncoder().encode(value),
  );
  if(!HEX64.test(result)){
    fail(
      'hsme_offline_physical_hash',
      'hash port must return lowercase SHA-256',
    );
  }
  return result;
}

async function digest(
  domain:string,
  value:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const result=await hash.sha256(
    new TextEncoder().encode(
      domain+JSON.stringify(value),
    ),
  );
  if(!HEX64.test(result)){
    fail(
      'hsme_offline_physical_hash',
      'hash port must return lowercase SHA-256',
    );
  }
  return result;
}

function exactRecord(
  raw:unknown,
  fields:readonly string[],
  path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail(
      'hsme_offline_physical_schema',
      path+' must be an object',
    );
  }
  const proto=Object.getPrototypeOf(raw);
  if(proto!==Object.prototype&&proto!==null){
    fail(
      'hsme_offline_physical_schema',
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
      'hsme_offline_physical_schema',
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
      'hsme_offline_physical_value',
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
      'hsme_offline_physical_value',
      path+' must be an identifier',
    );
  }
  return value;
}

function httpsUrl(
  raw:unknown,
  path:string,
):string{
  const value=boundedString(raw,path,2048);
  if(!HTTPS_URL.test(value)){
    fail(
      'hsme_offline_physical_value',
      path+' must be an https URL',
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
      'hsme_offline_physical_value',
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
      'hsme_offline_physical_value',
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
      'hsme_offline_physical_value',
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
      'hsme_offline_physical_value',
      path+' must be a bounded safe integer',
    );
  }
  return raw as number;
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
  throw new Error(code+': '+message);
}
