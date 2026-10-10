import React, { useEffect, useRef, useState } from 'react';
import { coreClient } from '@/api/coreClient';

const MAX_PREVIEW_DIMENSION = 1024;

/**
 * Actual Core MASK alpha is decoded from a source-lineage-checked PNG. The
 * teal overlay is display-only; it never changes the photograph or Core data.
 * No rectangle or semantic label is substituted for a missing mask.
 */
export default function CanonicalMaskPreview({
  projectId,sourceArtifactId,maskArtifactId,width,height,
}) {
  const canvasRef=useRef(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    let cancelled=false;
    let bitmap=null;
    const canvas=canvasRef.current;
    if(!canvas || !projectId || !sourceArtifactId || !maskArtifactId ||
      !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width<1 || height<1) return undefined;
    const load=async()=>{
      try{
        setError('');
        const blob=await coreClient.artifacts.loadMaskPreview({
          projectId,sourceImageArtifactId:sourceArtifactId,maskArtifactId,
        });
        if(cancelled)return;
        bitmap=await createImageBitmap(blob);
        if(cancelled)return;
        if(bitmap.width!==width || bitmap.height!==height)
          throw new Error('Core MASK preview does not match the photo geometry');
        const scale=Math.min(1,MAX_PREVIEW_DIMENSION/Math.max(width,height));
        const w=Math.max(1,Math.round(width*scale));
        const h=Math.max(1,Math.round(height*scale));
        const scratch=document.createElement('canvas');
        scratch.width=w;scratch.height=h;
        const sourceContext=scratch.getContext('2d',{willReadFrequently:true});
        const context=canvas.getContext('2d');
        if(!sourceContext||!context)throw new Error('Mask overlay Canvas is unavailable');
        sourceContext.drawImage(bitmap,0,0,w,h);
        const rgba=sourceContext.getImageData(0,0,w,h).data;
        const pixels=context.createImageData(w,h);
        for(let i=0;i<rgba.length;i+=4){
          pixels.data[i]=16;pixels.data[i+1]=185;pixels.data[i+2]=129;
          pixels.data[i+3]=Math.round(rgba[i]*0.48);
        }
        if(cancelled)return;
        canvas.width=w;canvas.height=h;
        context.putImageData(pixels,0,0);
      }catch(cause){
        if(!cancelled) {
          canvas.width=0;canvas.height=0;
          setError(cause?.message||'MASK preview unavailable');
        }
      }finally{bitmap?.close();}
    };
    void load();
    return ()=>{cancelled=true;canvas.width=0;canvas.height=0;};
  },[projectId,sourceArtifactId,maskArtifactId,width,height]);
  return <>
    <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none"
      aria-label="Пиксельная маска выбранного объекта" role="img"/>
    {error&&(
      <div className="absolute bottom-2 right-2 max-w-60 rounded-md bg-destructive px-2 py-1 text-xs text-destructive-foreground pointer-events-none"
        role="status">
        Выбранная Core-маска недоступна: {error}
      </div>
    )}
  </>;
}
