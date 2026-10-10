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
  imageUrl, projectName, origin, fetcher=fetch,
  documentApi=document, urlApi=URL,
}) {
  if(typeof imageUrl!=='string'||!imageUrl.startsWith('/api/core/artifacts/results/'))
    throw new Error('Only a signed Core image may be downloaded');
  const address=new URL(imageUrl,origin);
  if(address.origin!==new URL(origin).origin ||
     !/^\/api\/core\/artifacts\/results\/[^/]+$/.test(address.pathname)||
     address.username||address.password||address.hash)
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
    setTimeout(()=>urlApi.revokeObjectURL(objectUrl),10_000);
  }
}
