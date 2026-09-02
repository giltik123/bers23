import { createHash } from 'node:crypto';
import {
  CONDITIONING_CANDIDATE_IDS,
  conditioningCandidateIdentity,
} from './kandinsky-conditioning-candidate-registry.mjs';

export { CONDITIONING_CANDIDATE_IDS };
export const KANDINSKY_D2B_PROMPT_SCHEMA_VERSION = 1;
export const KANDINSKY_D2B_STAGE = 'F5B1_D2B_PROMPT_SEMANTICS_RESEARCH';
export const KANDINSKY_D2B_INTENT = 'GARMENT_APPEARANCE_REFINEMENT_RESEARCH_ONLY';
export const KANDINSKY_HISTORICAL_DIFFUSERS_REVISION = '746215670a61af1034c470d0b6555be9c60cb7b6';
export const KANDINSKY_PRIOR_PIPELINE_BLOB_SHA = '3b9974a5dd70e8b775caa01efab6b637ff22d9e5';
export const KANDINSKY_INPAINT_PIPELINE_BLOB_SHA = '151312979f815d6354b9d5207cba999fe26e43a7';

const REALISM_PROMPT = 'photorealistic garment fit, realistic fabric texture and folds, natural lighting and shadows, high detail';

export const KANDINSKY_D2B_CANDIDATES = Object.freeze({
  A_NEUTRAL_ZERO_NEGATIVE: Object.freeze({
    positivePrompt: 'realistic photograph of the existing garment fit',
    negativePrompt: null,
    negativeMode: 'HISTORICAL_ZERO_IMAGE',
    positiveEmbeddingSourceCandidateId: null,
  }),
  B_REALISM_ZERO_NEGATIVE: Object.freeze({
    positivePrompt: REALISM_PROMPT,
    negativePrompt: null,
    negativeMode: 'HISTORICAL_ZERO_IMAGE',
    positiveEmbeddingSourceCandidateId: null,
  }),
  C_PRESERVATION_EXPLICIT_NEGATIVE: Object.freeze({
    positivePrompt: REALISM_PROMPT,
    negativePrompt: 'different garment, changed garment design, changed silhouette, changed color, changed pattern, changed logo, changed body shape, changed pose, extra garment, missing garment, distorted fabric, low quality, bad quality',
    negativeMode: 'EXPLICIT_NEGATIVE_PRIOR',
    positiveEmbeddingSourceCandidateId: 'B_REALISM_ZERO_NEGATIVE',
  }),
});

export function conditioningPromptContract(candidateId) {
  const candidate = KANDINSKY_D2B_CANDIDATES[candidateId];
  if (!candidate) throw new Error('Unknown Kandinsky D2b conditioning candidate');
  const identity = conditioningCandidateIdentity(candidateId);
  if (candidate.negativeMode !== identity.negativeMode || candidate.positiveEmbeddingSourceCandidateId !== identity.positiveEmbeddingSourceCandidateId) {
    throw new Error('Kandinsky D2b candidate semantics drift from shared identity registry');
  }
  const contract = Object.freeze({
    schemaVersion: KANDINSKY_D2B_PROMPT_SCHEMA_VERSION,
    stage: KANDINSKY_D2B_STAGE,
    candidateId,
    positivePrompt: candidate.positivePrompt,
    negativePrompt: candidate.negativePrompt,
    negativeMode: candidate.negativeMode,
    positiveEmbeddingSourceCandidateId: candidate.positiveEmbeddingSourceCandidateId,
    prior: Object.freeze({
      diffusersRevision: KANDINSKY_HISTORICAL_DIFFUSERS_REVISION,
      pipelineClass: 'KandinskyV22PriorPipeline',
      numImagesPerPrompt: 1,
      numInferenceSteps: 25,
      guidanceScale: 4,
      outputType: 'pt',
    }),
    decoder: Object.freeze({
      pipelineClass: 'KandinskyV22InpaintPipeline',
      guidanceScale: 4,
      embeddingOrder: Object.freeze(['negative_image_embeds', 'image_embeds']),
    }),
    intent: KANDINSKY_D2B_INTENT,
  });
  const sha256 = createHash('sha256').update(JSON.stringify(sortRecursively(contract))).digest('hex');
  if (sha256 !== identity.conditioningContractSha256) throw new Error('Kandinsky D2b conditioning contract identity drift');
  return Object.freeze({ contract, sha256 });
}

export function assertKandinskyD2bCandidateMatrix() {
  const a = KANDINSKY_D2B_CANDIDATES.A_NEUTRAL_ZERO_NEGATIVE;
  const b = KANDINSKY_D2B_CANDIDATES.B_REALISM_ZERO_NEGATIVE;
  const c = KANDINSKY_D2B_CANDIDATES.C_PRESERVATION_EXPLICIT_NEGATIVE;
  if (a.negativePrompt !== null || b.negativePrompt !== null) throw new Error('A/B must use historical zero-image negative conditioning');
  if (a.negativeMode !== 'HISTORICAL_ZERO_IMAGE' || b.negativeMode !== 'HISTORICAL_ZERO_IMAGE') throw new Error('A/B negative mode drift');
  if (c.negativeMode !== 'EXPLICIT_NEGATIVE_PRIOR' || typeof c.negativePrompt !== 'string' || !c.negativePrompt) throw new Error('C must generate an explicit negative prior');
  if (b.positivePrompt !== c.positivePrompt) throw new Error('B/C must hold positive prompt text constant');
  if (a.positivePrompt === b.positivePrompt) throw new Error('A/B must isolate neutral versus realism positive conditioning');
  if (a.positiveEmbeddingSourceCandidateId !== null || b.positiveEmbeddingSourceCandidateId !== null) throw new Error('A/B must generate their own positive prior embeddings');
  if (c.positiveEmbeddingSourceCandidateId !== 'B_REALISM_ZERO_NEGATIVE') throw new Error('C must reuse B image_embeds so B/C differ only in negative conditioning');
  for (const id of CONDITIONING_CANDIDATE_IDS) conditioningPromptContract(id);
  return true;
}

function sortRecursively(value) {
  if (Array.isArray(value)) return value.map(sortRecursively);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortRecursively(value[key])]));
}
