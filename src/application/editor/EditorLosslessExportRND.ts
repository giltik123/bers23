import type { PixelImage } from '../../platform/creative/pipeline/ControlledLocalEdit';
import { encodeDeterministicRgbaPng } from '../../platform/creative/deterministic/DeterministicPng';

/**
 * Local-only, user-controlled, lossless PNG export candidate.
 * No Core/tenant/Project/Artifact or download/upload authority is conferred.
 *
 * Source artifact ID and SHA are descriptive UNTRUSTED references until Core
 * independently authenticates them and verifies the bytes. No ICC/EXIF claims
 * or lossy output are made. Never use this function to publish a FINAL.
 */
export type EditorLosslessExportRND = Readonly<{
  kind: 'BERS_EDITOR_LOSSLESS_PNG_EXPORT_RND';
  sourceArtifactId: string;
  claimedSourceArtifactSha256: string;
  fileName: string;
  mimeType: 'image/png';
  width: number;
  height: number;
  pixelSha256: string;
  outputPngSha256: string;
  bytes: Uint8Array;
  outputByteLength: number;
  coreAuthorityGranted: false;
  cloudProviderUsed: false;
  verificationState: 'PNG_ENCODED_INDEPENDENT_DECODE_PENDING';
}>;

const hex=/^[0-9a-f]{64}$/u;
const artifact=/^[a-zA-Z0-9][a-zA-Z0-9:_.-]{0,127}$/u;
const filename=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/u;

async function sha256(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Secure SHA-256 capability is unavailable');
  const exact=new Uint8Array(bytes.byteLength);
  exact.set(bytes);
  const digest=await globalThis.crypto.subtle.digest('SHA-256',exact);
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}

/**
 * Prepares a preview file for *explicit* user download; does not invoke
 * canvas / browser color conversion or the legacy Core.UploadFile endpoint.
 */
export async function prepareEditorLosslessPngExportRND(input: Readonly<{
  sourceArtifactId: string;
  sourceArtifactSha256: string;
  baseFileName: string;
  image: PixelImage;
}>): Promise<EditorLosslessExportRND> {
  if (!input || !artifact.test(input.sourceArtifactId) ||
      !hex.test(input.sourceArtifactSha256) ||
      !filename.test(input.baseFileName)) {
    throw new Error('Editor export requires bounded source references and safe filename');
  }
  const image=input.image;
  if (!image || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) ||
      image.width<1 || image.height<1 ||
      image.width>16384 || image.height>16384 ||
      image.width*image.height>16_777_216 ||
      !(image.data instanceof Uint8ClampedArray) ||
      image.data.byteLength!==image.width*image.height*4 ||
      image.format!=='RGBA8' || image.orientation!==1 || image.colorSpace!=='srgb') {
    throw new Error('Editor export requires bounded canonical orientation-1 RGBA8 sRGB image');
  }
  // Snapshot once before the first await, preventing concurrent caller edits
  // from making pixel and encoded PNG digests describe different frames.
  const snapshot: PixelImage = Object.freeze({
    width:image.width,height:image.height,
    data:new Uint8ClampedArray(image.data),
    format:'RGBA8',orientation:1,colorSpace:'srgb',
  });
  const sourcePixels=new Uint8Array(snapshot.data);
  const pixelSha256=await sha256(sourcePixels);
  const bytes=await encodeDeterministicRgbaPng(snapshot);
  if(!(bytes instanceof Uint8Array)||bytes.length===0)throw new Error('Editor PNG encoding failed');
  const outputPngSha256=await sha256(bytes);
  return Object.freeze({
    kind:'BERS_EDITOR_LOSSLESS_PNG_EXPORT_RND',
    sourceArtifactId:input.sourceArtifactId,
    claimedSourceArtifactSha256:input.sourceArtifactSha256,
    fileName:`${input.baseFileName}.png`,
    mimeType:'image/png',width:image.width,height:image.height,
    pixelSha256,outputPngSha256,
    // Return a defensive buffer for every consumer read; callers cannot alter
    // the internally hashed/exported candidate by mutating a previous view.
    get bytes(): Uint8Array { return new Uint8Array(bytes); },
    outputByteLength:bytes.length,
    coreAuthorityGranted:false,cloudProviderUsed:false,
    verificationState:'PNG_ENCODED_INDEPENDENT_DECODE_PENDING',
  });
}
