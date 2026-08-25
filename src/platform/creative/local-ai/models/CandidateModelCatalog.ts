import efficientSam from './efficient-sam-ti.manifest.json' with { type: 'json' };
import modNet from './portrait-matting.manifest.json' with { type: 'json' };

export type LocalModelAcquisitionCandidate = Readonly<{
  modelId: string;
  version: string;
  packId: 'SEGMENTATION' | 'UPSCALE' | 'MATTING' | 'INPAINTING' | 'DEPTH';
  status: 'CANDIDATE';
  artifactState: string;
  semanticCapabilities: readonly string[];
  upstreamRevision: string;
  upstreamLicense: string;
  upstreamBytes: number | 'UNKNOWN';
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
  Object.freeze({
    modelId: String(modNet.modelId),
    version: String(modNet.version),
    packId: 'MATTING',
    status: 'CANDIDATE',
    artifactState: String(modNet.artifactState),
    semanticCapabilities: Object.freeze([...modNet.semanticCapabilities]),
    upstreamRevision: String(modNet.upstream.revision),
    upstreamLicense: String(modNet.upstream.license),
    upstreamBytes: typeof modNet.upstream.checkpoint.size === 'number' ? Number(modNet.upstream.checkpoint.size) : 'UNKNOWN',
    productionExecutable: false,
  }),
]);

export function acquisitionCandidatesForPack(packId: LocalModelAcquisitionCandidate['packId']): readonly LocalModelAcquisitionCandidate[] {
  return Object.freeze(LOCAL_MODEL_ACQUISITION_CANDIDATES.filter(candidate => candidate.packId === packId));
}
