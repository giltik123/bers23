export const CONDITIONING_CANDIDATE_IDS = Object.freeze([
  'A_NEUTRAL_ZERO_NEGATIVE',
  'B_REALISM_ZERO_NEGATIVE',
  'C_PRESERVATION_EXPLICIT_NEGATIVE',
]);

export const KANDINSKY_CONDITIONING_CANDIDATE_IDENTITIES = Object.freeze({
  A_NEUTRAL_ZERO_NEGATIVE: Object.freeze({
    conditioningContractSha256: '85bea25dc00c2e23c4c2cf9e41a2a0531e93a19059d4dc3fa0c9208c766217e4',
    negativeMode: 'HISTORICAL_ZERO_IMAGE',
    positiveEmbeddingSourceCandidateId: null,
  }),
  B_REALISM_ZERO_NEGATIVE: Object.freeze({
    conditioningContractSha256: 'd0dc3f97e84e7439c063f5fbcb1c3eae9b668c3d84dd8adfa1ed116837e3f175',
    negativeMode: 'HISTORICAL_ZERO_IMAGE',
    positiveEmbeddingSourceCandidateId: null,
  }),
  C_PRESERVATION_EXPLICIT_NEGATIVE: Object.freeze({
    conditioningContractSha256: '804544da31ad9765793d830225fcad7119058965b665349170f2123474541f30',
    negativeMode: 'EXPLICIT_NEGATIVE_PRIOR',
    positiveEmbeddingSourceCandidateId: 'B_REALISM_ZERO_NEGATIVE',
  }),
});

export function conditioningCandidateIdentity(candidateId) {
  if (!CONDITIONING_CANDIDATE_IDS.includes(candidateId)) throw new Error('conditioning.candidateId is not a closed D2 research identity');
  return KANDINSKY_CONDITIONING_CANDIDATE_IDENTITIES[candidateId];
}
