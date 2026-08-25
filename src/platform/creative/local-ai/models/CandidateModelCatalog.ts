import efficientSam from './efficient-sam-ti.manifest.json' with { type: 'json' };

export type LocalModelAcquisitionCandidate = Readonly<{
  modelId: string;
  version: string;
  packId: 'SEGMENTATION' | 'UPSCALE' | 'MATTING' | 'INPAINTING' | 'DEPTH';
  status: 'CANDIDATE';
  artifactState: string;
  semanticCapabilities: readonly string[];
  upstreamRevision: string;
  upstreamLicense: string;
  upstreamBytes: number;
  productionExecutable: false;
}>;

/**
 * Discovery/acquisition metadata only. These entries are deliberately not ModelManifest
 * values: they have no downloadUri/signature/runtime READY status and therefore cannot be
 * passed directly into ModelFleetPlanner, LocalModelDownloader or execution selection.
 */
export const LOCAL_MODEL_ACQUISITION_CANDIDATES: readonly LocalModelAcquisitionCandidate[] = Object.freeze([
  Object.freeze({
    modelId: String(efficientSam.modelId),
    version: String(efficientSam.version),
    packId: 'SEGMENTATION',
    status: 'CANDIDATE',
    artifactState: String(efficientSam.artifactState),
    semanticCapabilities: Object.freeze([...efficientSam.semanticCapabilities]),
    upstreamRevision: String(efficientSam.upstream.revision),
    upstreamLicense: String(efficientSam.upstream.license),
    upstreamBytes: Number(efficientSam.upstream.artifacts.encoder.size) + Number(efficientSam.upstream.artifacts.decoder.size),
    productionExecutable: false,
  }),
]);

export function acquisitionCandidatesForPack(packId: LocalModelAcquisitionCandidate['packId']): readonly LocalModelAcquisitionCandidate[] {
  return Object.freeze(LOCAL_MODEL_ACQUISITION_CANDIDATES.filter(candidate => candidate.packId === packId));
}
