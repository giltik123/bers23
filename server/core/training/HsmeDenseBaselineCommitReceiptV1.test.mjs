import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  CORE_HSME_DENSE_BASELINE_COMMIT_RESULT_V1_SCHEMA,
  commitHsmeDenseBaselinePersistenceIntentV1,
  coreHsmeDenseBaselineCommitResultV1Digest,
  hsmeDenseBaselineCommitReceiptV1Digest,
} from './HsmeDenseBaselineCommitReceiptV1.ts';
import {
  HSME_DENSE_BASELINE_CANONICAL_DECISION_PATH,
  HSME_DENSE_BASELINE_PERSISTENCE_INTENT_V1_SCHEMA,
  hsmeDenseBaselinePersistenceIntentV1Digest,
} from './HsmeDenseBaselinePersistenceIntentV1.ts';

const hash={
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
};

function h(ch){return ch.repeat(64);}

function intentAuthority(){
  return {
    canonicalDecisionPersistAllowed:false,
    fileMutationAllowed:false,
    trainingExecutionAllowed:false,
    checkpointPromotionAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}

function hostAuthority(){
  return {
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}

async function intent(){
  const nextCanonicalJson=JSON.stringify({
    schemaVersion:'SYNTHETIC_CANONICAL_DENSE_BASELINE',
    state:'PINNED',
  });
  const nextFileSha256=await hash.sha256(
    new TextEncoder().encode(nextCanonicalJson+'\n'),
  );
  const base={
    schemaVersion:HSME_DENSE_BASELINE_PERSISTENCE_INTENT_V1_SCHEMA,
    state:'PERSISTENCE_INTENT_READY_NOT_COMMITTED',
    blockers:[],
    selectedBaselineFinalizationSha256:h('1'),
    approvalEvidenceSha256:h('2'),
    canonicalPath:HSME_DENSE_BASELINE_CANONICAL_DECISION_PATH,
    expectedCurrentDecisionSha256:h('3'),
    expectedCurrentFileSha256:h('4'),
    nextDecisionSha256:h('5'),
    nextFileSha256,
    nextCanonicalJson,
    persistenceIntentSha256:h('0'),
    ...intentAuthority(),
  };
  const persistenceIntentSha256=
    await hsmeDenseBaselinePersistenceIntentV1Digest(base,hash);
  return {...base,persistenceIntentSha256};
}

const trueIntentOrigin={
  async verifyPersistenceIntent(){return true;},
};
const falseIntentOrigin={
  async verifyPersistenceIntent(){return false;},
};
const trueHostOrigin={
  async verifyCommitResult(){return true;},
};
const falseHostOrigin={
  async verifyCommitResult(){return false;},
};

function fakeHost(mode,options={}){
  const calls=[];
  return {
    calls,
    async commitExactCanonicalBaseline(request){
      calls.push(request);
      const staleBefore=h('e');
      const state=
        mode==='APPLIED'
          ?'CANONICAL_BASELINE_COMMIT_APPLIED'
          :mode==='ALREADY'
            ?'CANONICAL_BASELINE_COMMIT_ALREADY_APPLIED'
            :'CANONICAL_BASELINE_COMMIT_STALE_BLOCKED';
      const raw={
        schemaVersion:CORE_HSME_DENSE_BASELINE_COMMIT_RESULT_V1_SCHEMA,
        state,
        persistenceIntentSha256:request.persistenceIntentSha256,
        canonicalPath:HSME_DENSE_BASELINE_CANONICAL_DECISION_PATH,
        expectedCurrentFileSha256:request.expectedCurrentFileSha256,
        requestedNextFileSha256:request.nextFileSha256,
        requestedNextBytes:request.nextFileBytes,
        observedBeforeFileSha256:
          mode==='APPLIED'
            ?request.expectedCurrentFileSha256
            :mode==='ALREADY'
              ?request.nextFileSha256
              :staleBefore,
        observedAfterFileSha256:
          mode==='STALE'?staleBefore:request.nextFileSha256,
        writePerformed:mode==='APPLIED',
        atomicSameDirectoryReplace:mode==='APPLIED',
        noSymlinkTraversal:true,
        durabilityAttested:mode==='APPLIED',
        commitAttemptId:'synthetic-commit-attempt-001',
        ...hostAuthority(),
        hostResultSha256:h('0'),
        ...(options.patch??{}),
      };
      if(options.keepWrongDigest===true){
        return raw;
      }
      const hostResultSha256=
        await coreHsmeDenseBaselineCommitResultV1Digest(raw,hash);
      return {...raw,hostResultSha256};
    },
  };
}

async function commit(value,host,overrides={}){
  return commitHsmeDenseBaselinePersistenceIntentV1(
    value,
    overrides.expectedIntentSha256??value.persistenceIntentSha256,
    overrides.intentOrigin??trueIntentOrigin,
    host,
    overrides.hostOrigin??trueHostOrigin,
    hash,
  );
}

test('exact intent drives one fixed APPLIED compare-and-swap receipt',async()=>{
  const value=await intent();
  const host=fakeHost('APPLIED');
  const receipt=await commit(value,host);

  assert.equal(receipt.state,'CANONICAL_BASELINE_PERSISTED_NOT_PROMOTED');
  assert.deepEqual(receipt.blockers,[]);
  assert.equal(receipt.persistenceIntentSha256,value.persistenceIntentSha256);
  assert.equal(receipt.expectedCurrentFileSha256,value.expectedCurrentFileSha256);
  assert.equal(receipt.nextFileSha256,value.nextFileSha256);
  assert.equal(receipt.observedBeforeFileSha256,value.expectedCurrentFileSha256);
  assert.equal(receipt.observedAfterFileSha256,value.nextFileSha256);
  assert.equal(receipt.writePerformed,true);
  assert.equal(receipt.furtherFileMutationAllowed,false);
  assert.equal(receipt.modelInstallAllowed,false);
  assert.equal(receipt.productionAuthorityGranted,false);
  assert.equal(host.calls.length,1);

  const request=host.calls[0];
  assert.equal(request.canonicalPath,HSME_DENSE_BASELINE_CANONICAL_DECISION_PATH);
  assert.equal(request.nextCanonicalFileText,value.nextCanonicalJson+'\n');
  assert.equal(
    Buffer.from(request.nextCanonicalFileBytes).toString('utf8'),
    value.nextCanonicalJson+'\n',
  );
  assert.equal(
    await hash.sha256(request.nextCanonicalFileBytes),
    value.nextFileSha256,
  );
  assert.equal(
    await hsmeDenseBaselineCommitReceiptV1Digest(receipt,hash),
    receipt.receiptEvidenceSha256,
  );
});

test('exact replay becomes ALREADY_APPLIED with zero second write',async()=>{
  const value=await intent();
  const host=fakeHost('ALREADY');
  const receipt=await commit(value,host);

  assert.equal(
    receipt.state,
    'CANONICAL_BASELINE_ALREADY_PERSISTED_NOT_PROMOTED',
  );
  assert.equal(receipt.writePerformed,false);
  assert.equal(receipt.observedBeforeFileSha256,value.nextFileSha256);
  assert.equal(receipt.observedAfterFileSha256,value.nextFileSha256);
  assert.notEqual(receipt.receiptEvidenceSha256,'UNKNOWN');
});

test('third raw file identity is STALE_BLOCKED and never a success receipt',async()=>{
  const value=await intent();
  const host=fakeHost('STALE');
  const receipt=await commit(value,host);

  assert.equal(
    receipt.state,
    'CANONICAL_BASELINE_PERSISTENCE_STALE_BLOCKED',
  );
  assert.ok(
    receipt.blockers.includes('CANONICAL_BASELINE_COMMIT_STALE_CURRENT_FILE'),
  );
  assert.equal(receipt.writePerformed,false);
  assert.equal(receipt.receiptEvidenceSha256,'UNKNOWN');
});

test('untrusted persistence intent fails before protected host invocation',async()=>{
  const value=await intent();
  const host=fakeHost('APPLIED');
  const receipt=await commit(value,host,{intentOrigin:falseIntentOrigin});

  assert.equal(receipt.state,'CANONICAL_BASELINE_PERSISTENCE_INVALID');
  assert.ok(
    receipt.blockers.includes('CANONICAL_BASELINE_COMMIT_INTENT_ORIGIN_UNVERIFIED'),
  );
  assert.equal(host.calls.length,0);
});

test('host-result digest drift cannot mint a persistence receipt',async()=>{
  const value=await intent();
  const host=fakeHost('APPLIED',{keepWrongDigest:true});
  const receipt=await commit(value,host);

  assert.equal(receipt.state,'CANONICAL_BASELINE_PERSISTENCE_INVALID');
  assert.ok(
    receipt.blockers.includes(
      'CANONICAL_BASELINE_COMMIT_HOST_RESULT_REHASH_MISMATCH',
    ),
  );
});

test('host-result external origin refusal fails closed',async()=>{
  const value=await intent();
  const host=fakeHost('APPLIED');
  const receipt=await commit(value,host,{hostOrigin:falseHostOrigin});

  assert.equal(receipt.state,'CANONICAL_BASELINE_PERSISTENCE_INVALID');
  assert.ok(
    receipt.blockers.includes(
      'CANONICAL_BASELINE_COMMIT_HOST_RESULT_ORIGIN_UNVERIFIED',
    ),
  );
});

test('APPLIED after-SHA drift is invalid even with a self-consistent host digest',async()=>{
  const value=await intent();
  const host=fakeHost('APPLIED',{
    patch:{observedAfterFileSha256:h('9')},
  });
  const receipt=await commit(value,host);

  assert.equal(receipt.state,'CANONICAL_BASELINE_PERSISTENCE_INVALID');
  assert.ok(
    receipt.blockers.includes(
      'CANONICAL_BASELINE_COMMIT_APPLIED_RESULT_INCONSISTENT',
    ),
  );
});

test('host cannot widen path or symlink semantics',async()=>{
  const value=await intent();
  const pathHost=fakeHost('APPLIED',{
    patch:{canonicalPath:'tmp/other.json'},
    keepWrongDigest:true,
  });
  const pathReceipt=await commit(value,pathHost);
  assert.equal(pathReceipt.state,'CANONICAL_BASELINE_PERSISTENCE_INVALID');
  assert.ok(
    pathReceipt.blockers.includes('CANONICAL_BASELINE_COMMIT_HOST_RESULT_INVALID'),
  );

  const symlinkHost=fakeHost('APPLIED',{
    patch:{noSymlinkTraversal:false},
    keepWrongDigest:true,
  });
  const symlinkReceipt=await commit(value,symlinkHost);
  assert.equal(symlinkReceipt.state,'CANONICAL_BASELINE_PERSISTENCE_INVALID');
  assert.ok(
    symlinkReceipt.blockers.includes('CANONICAL_BASELINE_COMMIT_HOST_RESULT_INVALID'),
  );
});
