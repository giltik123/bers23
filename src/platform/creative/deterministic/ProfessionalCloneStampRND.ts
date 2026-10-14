/**
 * Precision Clone Stamp — deterministic local sRGB-linear brush reference.
 *
 * One registered stamp, with hard/soft antialiased falloff, separate source
 * and destination centers, optional protected R8 matte and exact source RGBA
 * immutability. Does NOT automatically invent/heal texture or run remote AI.
 *
 * Every sampled clone pixel comes from the ORIGINAL immutable source, never
 * a concurrently overwritten intermediate. RGB is blended in linear light.
 * Target alpha and out-of-stamp / zero-mask bytes are copied exactly.
 *
 * Research only: no Project/MASK/Artifact/Core/FINAL/Undo authority.
 */
export type ProfessionalCloneStampRND = Readonly<{
  targetX: number;
  targetY: number;
  sampleX: number;
  sampleY: number;
  radius: number;     // integer, pixels
  hardnessQ8: number; // 0..255, always a 1px antialias at outer edge
  opacityQ8: number;  // 0..255
}>;

const MAX_PIXELS=4_194_304;
const linear=Float64Array.from({length:256},(_,value)=>{
  const t=value/255;return t<=0.04045?t/12.92:((t+.055)/1.055)**2.4;
});
function srgb(v:number):number{
  const t=Math.max(0,Math.min(1,v));
  return Math.round(255*(t<=.0031308?12.92*t:1.055*t**(1/2.4)-.055));
}
export function precisionCloneStampRgba8RND(
  source:Uint8Array|Uint8ClampedArray,
  width:number,height:number,
  stamp:ProfessionalCloneStampRND,
  editableMask?:Uint8Array|Uint8ClampedArray,
):Uint8ClampedArray {
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||
     width<1||height<1||width>4096||height>4096||width*height>MAX_PIXELS){
    throw new Error('Clone Stamp source geometry exceeds bounded raster budget');
  }
  const pixels=width*height;
  if(!(source instanceof Uint8Array||source instanceof Uint8ClampedArray)||
     source.byteLength!==pixels*4)throw new Error('Clone Stamp requires exact source RGBA8');
  if(editableMask!==undefined &&
     (!(editableMask instanceof Uint8Array||editableMask instanceof Uint8ClampedArray)||
      editableMask.byteLength!==pixels))throw new Error('Clone Stamp requires exact R8 matte');
  if(!stamp||!['targetX','targetY','sampleX','sampleY','radius',
      'hardnessQ8','opacityQ8'].every(key=>Number.isSafeInteger(stamp[key as keyof ProfessionalCloneStampRND]))||
     stamp.targetX<0||stamp.targetX>=width||stamp.targetY<0||stamp.targetY>=height||
     stamp.sampleX<0||stamp.sampleX>=width||stamp.sampleY<0||stamp.sampleY>=height||
     stamp.radius<1||stamp.radius>256||stamp.hardnessQ8<0||stamp.hardnessQ8>255||
     stamp.opacityQ8<0||stamp.opacityQ8>255){
    throw new Error('Clone Stamp geometry, alpha or hardness invalid');
  }
  const output=new Uint8ClampedArray(source);
  if(stamp.opacityQ8===0)return output;
  const inner=Math.max(0,(stamp.radius-1)*stamp.hardnessQ8/255);
  const minX=Math.max(0,stamp.targetX-stamp.radius);
  const maxX=Math.min(width-1,stamp.targetX+stamp.radius);
  const minY=Math.max(0,stamp.targetY-stamp.radius);
  const maxY=Math.min(height-1,stamp.targetY+stamp.radius);
  for(let y=minY;y<=maxY;y++){
    for(let x=minX;x<=maxX;x++){
      const distance=Math.hypot(x-stamp.targetX,y-stamp.targetY);
      if(distance>=stamp.radius)continue;
      const srcX=stamp.sampleX+(x-stamp.targetX);
      const srcY=stamp.sampleY+(y-stamp.targetY);
      if(srcX<0||srcX>=width||srcY<0||srcY>=height)continue;
      const destIndex=y*width+x,sourceIndex=srcY*width+srcX;
      const coverage=editableMask===undefined?1:editableMask[destIndex]/255;
      if(coverage===0)continue;
      const srcOffset=sourceIndex*4,dstOffset=destIndex*4;
      const alpha=source[srcOffset+3]/255;
      if(alpha===0||source[dstOffset+3]===0)continue;
      const t=distance<=inner?0:(distance-inner)/(stamp.radius-inner);
      const feather=1-t*t*(3-2*t);
      const weight=coverage*(stamp.opacityQ8/255)*alpha*feather;
      if(weight<=0)continue;
      if(weight>=1){
        output.set(source.subarray(srcOffset,srcOffset+3),dstOffset);
        continue;
      }
      for(let ch=0;ch<3;ch++){
        const oldColor=linear[source[dstOffset+ch]];
        const sampledColor=linear[source[srcOffset+ch]];
        output[dstOffset+ch]=srgb(oldColor*(1-weight)+sampledColor*weight);
      }
    }
  }
  return output;
}
