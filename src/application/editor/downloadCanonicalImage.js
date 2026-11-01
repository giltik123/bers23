import { canonicalCoreResourcePath, resolveCoreResourceUrl, CONFIGURED_CORE_API_ROOT } from '../../api/coreResourceUrl.js';

export const MAX_CANONICAL_DOWNLOAD_BYTES=100_000_000;

/**
 * Testable smaller budgets may only tighten, never exceed, this limit.
 * A response is bounded while streaming, not after blob() allocates it.
 */
async function readBoundedImage(response,mime,maxBytes) {
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>MAX_CANONICAL_DOWNLOAD_BYTES)
    throw new Error('Core export byte limit is invalid');
  const declared=response.headers.get('content-length');
  if(declared!==null && /^\d+$/.test(declared) && Number(declared)>maxBytes)
    throw new Error('Core image export exceeds safety limits');
  if(!response.body || typeof response.body.getReader!=='function')
    throw new Error('Core image response must be a readable stream');
  const reader=response.body.getReader(),chunks=[];
  let length=0,ended=false;
  try {
    for(;;) {
      const {done,value}=await reader.read();
      if(done){ended=true;break;}
      if(!(value instanceof Uint8Array))throw new Error('Core image response contains an invalid chunk');
      length+=value.byteLength;
      if(length>maxBytes)throw new Error('Core image export exceeds safety limits');
      chunks.push(value);
    }
  } finally {
    if(!ended)await reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
  if(length===0)throw new Error('Core export contains no image pixels');
  const blob=new Blob(chunks,{type:mime});
  // MIME headers alone cannot prove these are PNG/JPEG/WebP bytes.
  const prefix=new Uint8Array(await blob.slice(0,12).arrayBuffer());
  const png=prefix.length>=8 && [137,80,78,71,13,10,26,10].every((n,i)=>prefix[i]===n);
  const jpeg=prefix.length>=3&&prefix[0]===255&&prefix[1]===216&&prefix[2]===255;
  const webp=prefix.length>=12&&[82,73,70,70].every((n,i)=>prefix[i]===n)&&
    [87,69,66,80].every((n,i)=>prefix[i+8]===n);
  if(!((mime==='image/png'&&png)||(mime==='image/jpeg'&&jpeg)||(mime==='image/webp'&&webp)))
    throw new Error('Core image response does not match its declared image format');
  return blob;
}

/**
 * Download the actual current canonical Project image, not a preview tab.
 * The opaque signed delivery token stays inside the existing Core route.
 * No external URL, arbitrary MIME type or unbounded binary is permitted.
 */
export function canonicalDownloadName(projectName, contentType) {
  const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[contentType];
  if(!ext)throw new Error('Export format is not supported by Core');
  const stem=String(projectName||'BERS-image')
    // Invisible direction controls can spoof the displayed extension.
    .replace(/[\\/\x00-\x1f\x7f-\x9f<>:"|?*\u061c\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,'_')
    .replace(/^\.+/,'').trim().slice(0,95).replace(/[. ]+$/,'') || 'BERS-image';
  // Windows treats device names as reserved even when an extension is appended.
  const safeStem=/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)
    ? `BERS-${stem}` : stem;
  return `${safeStem}.${ext}`;
}

export async function downloadCanonicalImage({
  imageUrl, projectName, origin, coreApiRoot=CONFIGURED_CORE_API_ROOT, fetcher=fetch,
  documentApi=document, urlApi=URL,
  scheduleRevoke=callback=>setTimeout(callback,10_000),
  maxBytes=MAX_CANONICAL_DOWNLOAD_BYTES,
}) {
  // The current Project URL may be rewritten to the configured Core origin
  // for split frontend/Core deployments. Only the exact configured origin is
  // permitted; do not let imageUrl select an arbitrary remote host.
  const canonicalPath=canonicalCoreResourcePath(imageUrl,coreApiRoot);
  if(!canonicalPath ||
     !/^\/api\/core\/artifacts\/results\/[A-Za-z0-9%._~-]+$/.test(canonicalPath))
    throw new Error('Only a signed Core image may be downloaded');
  const resolved=resolveCoreResourceUrl(canonicalPath,coreApiRoot);
  const address=new URL(resolved,origin);
  const expectedRoot=coreApiRoot.startsWith('http')
    ?new URL(coreApiRoot).origin:new URL(origin).origin;
  if(address.origin!==expectedRoot || address.username||address.password ||
     address.search || address.hash)
    throw new Error('Core image download URL is invalid');
  const response=await fetcher(address.href,{
    method:'GET',credentials:'include',redirect:'error',
    headers:{Accept:'image/png,image/jpeg,image/webp'},
  });
  if(!response.ok)throw new Error(`Core image download failed (HTTP ${response.status})`);
  const mime=(response.headers.get('content-type')||'').split(';',1)[0].trim().toLowerCase();
  const filename=canonicalDownloadName(projectName,mime);
  const blob=await readBoundedImage(response,mime,maxBytes);
  const objectUrl=urlApi.createObjectURL(blob);
  let anchor,dispatched=false;
  try{
    anchor=documentApi.createElement('a');
    anchor.href=objectUrl;
    anchor.download=filename;
    anchor.style.display='none';
    documentApi.body.appendChild(anchor);
    anchor.click();
    dispatched=true;
    return filename;
  }finally{
    try { anchor?.remove(); }
    finally {
      // A failed DOM setup or blocked click must not leak the image Blob.
      // After a successful click, browsers need time to dispatch the download.
      if(dispatched) scheduleRevoke(()=>urlApi.revokeObjectURL(objectUrl));
      else urlApi.revokeObjectURL(objectUrl);
    }
  }
}
