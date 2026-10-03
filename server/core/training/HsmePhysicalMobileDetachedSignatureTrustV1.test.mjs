import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  captureHsmeNativeMobileEnergyThermalEvidenceV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeNativeMobileEnergyThermalEvidenceV1.ts';
import {
  HSME_FOUNDATION_PHYSICAL_DETACHED_SIGNATURE_MATERIAL_V1_SCHEMA,
  HSME_NATIVE_TELEMETRY_ATTESTATION_IDENTITY_DIGEST_DOMAIN,
  HSME_NATIVE_TELEMETRY_DETACHED_SIGNATURE_MATERIAL_V1_SCHEMA,
  HsmeOfflinePhysicalEvidenceTrustV1,
  hsmeFoundationPhysicalDetachedSignatureMaterialV1Digest,
  hsmeNativeTelemetryDetachedSignatureMaterialV1Digest,
} from './HsmePhysicalMobileDetachedSignatureTrustV1.ts';

const hash={
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
};
const H=value=>createHash('sha256').update(value).digest('hex');

const FOUNDATION_KEY='bers-hsme-mobile-device-evidence-v1';
const NATIVE_KEY='bers-hsme-native-telemetry-v1';
const ALGORITHM='ED25519-SHA256-V1';

function signaturePort(mode='TRUE'){
  const calls=[];
  return {
    calls,
    async verify(publisher,signature,digest){
      calls.push({publisher,signature,digest});
      if(mode==='THROW')throw new Error('signature verifier unavailable');
      return mode==='TRUE';
    },
  };
}

function attestation(overrides={}){
  return {
    evidenceUrl:'https://evidence.example/hsme/mobile-run.json',
    signatureUrl:'https://evidence.example/hsme/mobile-run.json.sig',
    verificationKeyId:FOUNDATION_KEY,
    ...overrides,
  };
}

async function foundationMaterial(
  canonicalPayload,
  overrides={},
){
  const a=attestation();
  const base={
    schemaVersion:
      HSME_FOUNDATION_PHYSICAL_DETACHED_SIGNATURE_MATERIAL_V1_SCHEMA,
    evidenceUrl:a.evidenceUrl,
    signatureUrl:a.signatureUrl,
    verificationKeyId:a.verificationKeyId,
    canonicalPayloadSha256:H(canonicalPayload),
    signature:'foundation-detached-signature',
    signatureAlgorithmId:ALGORITHM,
    signedAtMs:1_000,
    signatureMaterialSha256:H('placeholder'),
    ...overrides,
  };
  const signatureMaterialSha256=
    await hsmeFoundationPhysicalDetachedSignatureMaterialV1Digest(
      base,
      hash,
    );
  return {...base,signatureMaterialSha256};
}

function nativeIdentityPayload(overrides={}){
  return {
    deviceRunSessionSha256:H('device-run-session'),
    deviceCapabilityKey:H('device-capability'),
    supportedDeviceClass:'snapdragon-8-gen-3-mobile',
    actualPlacement:'NPU',
    runtimeIdentitySha256:H('runtime-id'),
    adapterBuildSha256:H('adapter-build'),
    verificationKeyId:NATIVE_KEY,
    signatureAlgorithmId:ALGORITHM,
    ...overrides,
  };
}

function nativeAttestationId(identity){
  return H(
    HSME_NATIVE_TELEMETRY_ATTESTATION_IDENTITY_DIGEST_DOMAIN
    +JSON.stringify(identity),
  );
}

async function telemetryRecord(identity=nativeIdentityPayload()){
  return captureHsmeNativeMobileEnergyThermalEvidenceV1(
    {
      async capture(){
        return {
          platform:'ANDROID',
          processIdentity:'android-process-202',
          sessionIdentity:'android-session-a',
          deviceRunSessionSha256:identity.deviceRunSessionSha256,
          deviceCapabilityKey:identity.deviceCapabilityKey,
          supportedDeviceClass:identity.supportedDeviceClass,
          runtimeIdentitySha256:identity.runtimeIdentitySha256,
          actualPlacement:identity.actualPlacement,
          nativeTelemetryAttestationSha256:
            nativeAttestationId(identity),
          sourceApi:'android-power-stats-native-v1',
          sourceApiVersion:'1',
          bridgeVersion:'android-hsme-energy-bridge-v1',
          adapterBuildSha256:identity.adapterBuildSha256,
          osBuildSha256:H('android-os-build'),
          runtimeBuildSha256:H('runtime-build'),
          capturedAtMicrosStart:1_000,
          capturedAtMicrosEnd:10_000,
          warmLatencyUs:[900,1_000,1_100],
          peakHostMemoryBytes:800_000_000,
          peakAcceleratorMemoryBytes:400_000_000,
          flashBytesMoved:100_000_000,
          ramBytesMoved:200_000_000,
          acceleratorBytesMoved:300_000_000,
          energyMicroJoulesTotal:3_000,
          batteryStartBps:8_000,
          batteryEndBps:7_950,
          powerSource:'BATTERY',
          thermalStartState:'NORMAL',
          thermalPeakState:'ELEVATED',
          thermalEndState:'NORMAL',
          throttledRunCount:0,
          networkBytesDuringExecution:0,
          energyMeasurementKind:'MEASURED_TOTAL_MICROJOULES',
          physicalOriginClaim:'REAL_PHYSICAL_DEVICE',
        };
      },
    },
    hash,
  );
}

async function nativeMaterial(record,identity=nativeIdentityPayload(),overrides={}){
  const base={
    schemaVersion:
      HSME_NATIVE_TELEMETRY_DETACHED_SIGNATURE_MATERIAL_V1_SCHEMA,
    telemetryEvidenceSha256:record.evidenceSha256,
    deviceRunSessionSha256:identity.deviceRunSessionSha256,
    deviceCapabilityKey:identity.deviceCapabilityKey,
    supportedDeviceClass:identity.supportedDeviceClass,
    actualPlacement:identity.actualPlacement,
    runtimeIdentitySha256:identity.runtimeIdentitySha256,
    adapterBuildSha256:identity.adapterBuildSha256,
    verificationKeyId:identity.verificationKeyId,
    signature:'native-detached-signature',
    signatureAlgorithmId:identity.signatureAlgorithmId,
    signedAtMs:1_001,
    signatureMaterialSha256:H('placeholder'),
    ...overrides,
  };
  const signatureMaterialSha256=
    await hsmeNativeTelemetryDetachedSignatureMaterialV1Digest(
      base,
      hash,
    );
  return {...base,signatureMaterialSha256};
}

function resolver(foundation,native,mode='OK'){
  const calls=[];
  return {
    calls,
    async resolveFoundationPhysicalSignature(value){
      calls.push({kind:'foundation',value});
      if(mode==='FOUNDATION_THROW')throw new Error('offline material unavailable');
      return foundation;
    },
    async resolveNativeTelemetrySignature(value){
      calls.push({kind:'native',value});
      if(mode==='NATIVE_THROW')throw new Error('offline material unavailable');
      return native;
    },
  };
}

function trust(resolverValue,signatureValue=signaturePort()){
  return new HsmeOfflinePhysicalEvidenceTrustV1(
    resolverValue,
    signatureValue,
    hash,
    {
      foundationVerificationKeyId:FOUNDATION_KEY,
      nativeTelemetryVerificationKeyId:NATIVE_KEY,
      signatureAlgorithmId:ALGORITHM,
    },
  );
}

test('valid foundation detached material verifies exact canonical payload offline',async()=>{
  const canonicalPayload='{"physical":"payload-v1"}';
  const material=await foundationMaterial(canonicalPayload);
  const signatures=signaturePort();
  const materials=resolver(material,null);
  const verifier=trust(materials,signatures);

  assert.equal(
    await verifier.verifyPhysicalRunEvidence(
      attestation(),
      canonicalPayload,
    ),
    true,
  );
  assert.equal(signatures.calls.length,1);
  assert.deepEqual(signatures.calls[0],{
    publisher:FOUNDATION_KEY,
    signature:'foundation-detached-signature',
    digest:H(canonicalPayload),
  });
  assert.equal(materials.calls.length,1);
});

test('foundation payload url key material digest and signature failures fail closed',async()=>{
  const canonicalPayload='{"physical":"payload-v1"}';
  const valid=await foundationMaterial(canonicalPayload);

  const cases=[
    {
      attestation:attestation(),
      payload:'{"physical":"tampered"}',
      material:valid,
      mode:'TRUE',
    },
    {
      attestation:attestation({
        evidenceUrl:'https://evidence.example/other.json',
      }),
      payload:canonicalPayload,
      material:valid,
      mode:'TRUE',
    },
    {
      attestation:attestation({
        verificationKeyId:'other-foundation-key',
      }),
      payload:canonicalPayload,
      material:valid,
      mode:'TRUE',
    },
    {
      attestation:attestation(),
      payload:canonicalPayload,
      material:{
        ...valid,
        signatureMaterialSha256:H('bad-material'),
      },
      mode:'TRUE',
    },
    {
      attestation:attestation(),
      payload:canonicalPayload,
      material:valid,
      mode:'FALSE',
    },
    {
      attestation:attestation(),
      payload:canonicalPayload,
      material:valid,
      mode:'THROW',
    },
  ];

  for(const item of cases){
    const verifier=trust(
      resolver(item.material,null),
      signaturePort(item.mode),
    );
    assert.equal(
      await verifier.verifyPhysicalRunEvidence(
        item.attestation,
        item.payload,
      ),
      false,
    );
  }

  const throwing=trust(
    resolver(valid,null,'FOUNDATION_THROW'),
    signaturePort(),
  );
  assert.equal(
    await throwing.verifyPhysicalRunEvidence(
      attestation(),
      canonicalPayload,
    ),
    false,
  );
});

test('valid native detached signature binds attestation identity and final evidence digest',async()=>{
  const identity=nativeIdentityPayload();
  const record=await telemetryRecord(identity);
  const material=await nativeMaterial(record,identity);
  const signatures=signaturePort();
  const verifier=trust(
    resolver(null,material),
    signatures,
  );

  assert.equal(
    record.evidence.nativeTelemetryAttestationSha256,
    nativeAttestationId(identity),
  );
  assert.equal(
    await verifier.verifyNativeMobileEnergyThermalEvidence(
      record,
      record.evidenceSha256,
    ),
    true,
  );
  assert.deepEqual(signatures.calls[0],{
    publisher:NATIVE_KEY,
    signature:'native-detached-signature',
    digest:record.evidenceSha256,
  });
});

test('native evidence digest session device placement runtime adapter key and signature drift fail closed',async()=>{
  const identity=nativeIdentityPayload();
  const record=await telemetryRecord(identity);
  const valid=await nativeMaterial(record,identity);

  const materialCases=[
    {...valid,telemetryEvidenceSha256:H('other-evidence')},
    {...valid,deviceRunSessionSha256:H('other-session')},
    {...valid,deviceCapabilityKey:H('other-device')},
    {...valid,supportedDeviceClass:'other-mobile'},
    {...valid,actualPlacement:'CPU'},
    {...valid,runtimeIdentitySha256:H('other-runtime')},
    {...valid,adapterBuildSha256:H('other-adapter')},
    {...valid,verificationKeyId:'other-native-key'},
    {...valid,signatureAlgorithmId:'OTHER-ALGORITHM'},
    {...valid,signatureMaterialSha256:H('bad-material')},
  ];

  for(const material of materialCases){
    const verifier=trust(
      resolver(null,material),
      signaturePort(),
    );
    assert.equal(
      await verifier.verifyNativeMobileEnergyThermalEvidence(
        record,
        record.evidenceSha256,
      ),
      false,
    );
  }

  for(const mode of ['FALSE','THROW']){
    const verifier=trust(
      resolver(null,valid),
      signaturePort(mode),
    );
    assert.equal(
      await verifier.verifyNativeMobileEnergyThermalEvidence(
        record,
        record.evidenceSha256,
      ),
      false,
    );
  }

  const throwing=trust(
    resolver(null,valid,'NATIVE_THROW'),
    signaturePort(),
  );
  assert.equal(
    await throwing.verifyNativeMobileEnergyThermalEvidence(
      record,
      record.evidenceSha256,
    ),
    false,
  );
});

test('native expected evidence digest and attestation identity cannot be substituted',async()=>{
  const identity=nativeIdentityPayload();
  const record=await telemetryRecord(identity);
  const valid=await nativeMaterial(record,identity);
  const verifier=trust(
    resolver(null,valid),
    signaturePort(),
  );

  assert.equal(
    await verifier.verifyNativeMobileEnergyThermalEvidence(
      record,
      H('different-expected-evidence'),
    ),
    false,
  );

  const alteredRecord={
    ...record,
    evidence:{
      ...record.evidence,
      nativeTelemetryAttestationSha256:H('other-attestation-id'),
    },
  };
  assert.equal(
    await verifier.verifyNativeMobileEnergyThermalEvidence(
      alteredRecord,
      record.evidenceSha256,
    ),
    false,
  );
});

test('unknown detached signature material fields fail closed',async()=>{
  const canonicalPayload='{"physical":"payload-v1"}';
  const foundation=await foundationMaterial(canonicalPayload);
  const identity=nativeIdentityPayload();
  const record=await telemetryRecord(identity);
  const native=await nativeMaterial(record,identity);

  const a=trust(
    resolver({...foundation,privateKey:'must-not-appear'},native),
    signaturePort(),
  );
  assert.equal(
    await a.verifyPhysicalRunEvidence(
      attestation(),
      canonicalPayload,
    ),
    false,
  );

  const b=trust(
    resolver(foundation,{...native,providerId:'cloud'}),
    signaturePort(),
  );
  assert.equal(
    await b.verifyNativeMobileEnergyThermalEvidence(
      record,
      record.evidenceSha256,
    ),
    false,
  );
});
