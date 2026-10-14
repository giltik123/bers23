/**
 * Manual R8 edit matte brush for photographic outcome control. This edits a
 * local preview mask, never source RGBA or a Core-owned MASK Artifact.
 *
 * A soft radial falloff avoids abrupt elliptical boundaries. The complete
 * stroke including high opacity areas is reversible by snapshot (caller-owned).
 * Brush modes ADD/SUBTRACT use alpha coverage / complementary alpha equations.
 */
export type ProfessionalMaskBrushStrokeRND=Readonly<{
  centerX:number;centerY:number;radius:number;
  hardnessQ8:number;opacityQ8:number;
  mode:'ADD'|'SUBTRACT';
}>;
export function paintProfessionalMaskR8RND(
  mask:Uint8Array|Uint8ClampedArray,
  width:number,height:number,
  stroke:ProfessionalMaskBrushStrokeRND,
):Uint8Array{
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||
     width<1||height<1||width>4096||height>4096||width*height>4_194_304){
    throw new Error('Edit mask geometry exceeds local safe budget');
  }
  if(!(mask instanceof Uint8Array||mask instanceof Uint8ClampedArray)||
     mask.byteLength!==width*height)throw new Error('Edit brush expects exact R8 matte');
  if(!stroke||!['centerX','centerY','radius','hardnessQ8','opacityQ8'].every(
    key=>Number.isSafeInteger(stroke[key as keyof ProfessionalMaskBrushStrokeRND]))||
    stroke.centerX<0||stroke.centerX>=width||stroke.centerY<0||stroke.centerY>=height||
    stroke.radius<1||stroke.radius>256||stroke.hardnessQ8<0||stroke.hardnessQ8>255||
    stroke.opacityQ8<0||stroke.opacityQ8>255||
    (stroke.mode!=='ADD'&&stroke.mode!=='SUBTRACT')){
    throw new Error('Edit brush stroke is invalid');
  }
  const output=new Uint8Array(mask);
  if(stroke.opacityQ8===0)return output;
  const inside=Math.max(0,(stroke.radius-1)*stroke.hardnessQ8/255);
  const loX=Math.max(0,stroke.centerX-stroke.radius);
  const hiX=Math.min(width-1,stroke.centerX+stroke.radius);
  const loY=Math.max(0,stroke.centerY-stroke.radius);
  const hiY=Math.min(height-1,stroke.centerY+stroke.radius);
  for(let y=loY;y<=hiY;y++)for(let x=loX;x<=hiX;x++){
    const d=Math.hypot(x-stroke.centerX,y-stroke.centerY);
    if(d>=stroke.radius)continue;
    const t=d<=inside?0:(d-inside)/(stroke.radius-inside);
    const coverage=(1-t*t*(3-2*t))*(stroke.opacityQ8/255);
    const index=y*width+x,old=output[index]/255;
    // ADD is one minus product of complement opacities.
    const next=stroke.mode==='ADD'?
      old+(1-old)*coverage:
      old*(1-coverage);
    output[index]=Math.round(next*255);
  }
  return output;
}
