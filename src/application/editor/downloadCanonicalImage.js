import { canonicalCoreResourcePath, resolveCoreResourceUrl, CONFIGURED_CORE_API_ROOT } from '../../api/coreResourceUrl.js';

/**
 * Download the actual current canonical Project image, not a preview tab.
 * The opaque signed delivery token stays inside the existing Core route.
 * No external URL, arbitrary MIME type or unbounded binary is permitted.
 */
export function canonicalDownloadName(projectName, contentType) {
  const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[contentType];
  if(!ext)throw new Error('Export format is not supported by Core');
  const stem=String(projectName||'BERS-image')
    .replace(/[\\/\x00-\x1f<>:"|?*]/g,'_').replace(/^\.+/,'')
    .trim().slice(0,95) || 'BERS-image';
  return `${stem}.${ext}`;
}

export async function downloadCanonicalImage({
  imageUrl, projectName, origin, coreApiRoot=CONFIGURED_CORE_API_ROOT, fetcher=fetch,
  documentApi=document, urlApi=URL,
  scheduleRevoke=callback=>setTimeout(callback,10_000),
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
    method:'GET',credentials:'include',
    headers:{Accept:'image/png,image/jpeg,image/webp'},
  });
  if(!response.ok)throw new Error(`Core image download failed (HTTP ${response.status})`);
  const mime=(response.headers.get('content-type')||'').split(';',1)[0].trim().toLowerCase();
  const filename=canonicalDownloadName(projectName,mime);
  const blob=await response.blob();
  if(blob.size<1||blob.size>100_000_000)
    throw new Error('Core export contains no image pixels or exceeds safety limits');
  const objectUrl=urlApi.createObjectURL(blob);
  const anchor=documentApi.createElement('a');
  try{
    anchor.href=objectUrl;
    anchor.download=filename;
    anchor.style.display='none';
    documentApi.body.appendChild(anchor);
    anchor.click();
    return filename;
  }finally{
    anchor.remove();
    // Chrome/Firefox need the object URL to remain alive until the file
    // download has been dispatched to the browser's download manager.
    scheduleRevoke(()=>urlApi.revokeObjectURL(objectUrl));
  }
}
