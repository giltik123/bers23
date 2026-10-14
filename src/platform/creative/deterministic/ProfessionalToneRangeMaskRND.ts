/**
 * Professional local luminance-range masks — isolated R&D candidate.
 *
 * sRGB8 -> linear D65 luminance -> L* perception for natural tonal ranges.
 * Range transitions are C1-continuous smoothstep weights. This masks a
 * color adjustment; it is NOT person/garment segmentation, semantic skin
 * selection, Core authorization or a claim of Photoshop equivalence.
 */
export type ProfessionalToneRegionRND =
  'ALL'|'SHADOWS'|'MIDTONES'|'HIGHLIGHTS';
export type ToneRangeMaskRND = Readonly<{
  region:ProfessionalToneRegionRND;
  mask:Uint8Array;
  eligiblePixels:number;
  selectedPixels:number;
  protectedPixels:number;
  protectedPixelPolicy:'EXPLICIT_R8_ZERO_IS_NEVER_SELECTED';
  coreAuthorityGranted:false;
}>;

const MAX_PIXELS=4_194_304;
const srgbToLinear=Float64Array.from({length:256},(_,v)=>{
  const x=v/255;return x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4;
});
const ALLOWED=new Set<ProfessionalToneRegionRND>(['ALL','SHADOWS','MIDTONES','HIGHLIGHTS']);
function smoothstep(a:number,b:number,x:number):number{
  const t=Math.max(0,Math.min(1,(x-a)/(b-a)));
  return t*t*(3-2*t);
}
function rangeWeight(region:ProfessionalToneRegionRND, l:number):number{
  switch(region){
    case 'ALL':return 1;
    case 'SHADOWS':return 1-smoothstep(.16,.48,l);
    case 'MIDTONES':return smoothstep(.15,.34,l)*(1-smoothstep(.68,.88,l));
    case 'HIGHLIGHTS':return smoothstep(.55,.91,l);
  }
}
export function professionalToneRangeMaskRgba8RND(
  image:Uint8Array|Uint8ClampedArray,
  width:number,
  height:number,
  region:ProfessionalToneRegionRND,
  editableMask?:Uint8Array|Uint8ClampedArray,
):ToneRangeMaskRND {
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||
      width<1||height<1||width>4096||height>4096||width*height>MAX_PIXELS){
    throw new Error('Professional tonal range geometry is out of bounds');
  }
  const count=width*height;
  if(!ALLOWED.has(region))throw new Error('Professional tonal range is unsupported');
  if(!(image instanceof Uint8Array||image instanceof Uint8ClampedArray)||
     image.byteLength!==count*4){
    throw new Error('Professional tonal range requires exact RGBA8');
  }
  if(editableMask!==undefined &&
     (!(editableMask instanceof Uint8Array||editableMask instanceof Uint8ClampedArray)||
      editableMask.byteLength!==count)){
    throw new Error('Professional tonal range requires same-frame R8 editable mask');
  }
  const result=new Uint8Array(count);
  let eligiblePixels=0,selectedPixels=0,protectedPixels=0;
  for(let p=0;p<count;p++){
    const o=p*4;
    if(image[o+3]===0||(editableMask!==undefined&&editableMask[p]===0)){
      protectedPixels++;
      continue;
    }
    eligiblePixels++;
    const y=.2126729*srgbToLinear[image[o]]+
      .7151522*srgbToLinear[image[o+1]]+
      .072175*srgbToLinear[image[o+2]];
    const lightness=y>216/24389?116*Math.cbrt(y)-16:(24389/27)*y;
    const perceptualL=Math.max(0,Math.min(1,lightness/100));
    const coverage=Math.round(255*rangeWeight(region,perceptualL));
    // Intersection with a separately supplied manual mask can only
    // reduce coverage; it cannot select an explicit zero-mask pixel.
    const clipped=editableMask===undefined?coverage:
      Math.floor((coverage*editableMask[p]+127)/255);
    result[p]=clipped;
    if(clipped!==0)selectedPixels++;
  }
  return Object.freeze({
    region,mask:result,eligiblePixels,selectedPixels,protectedPixels,
    protectedPixelPolicy:'EXPLICIT_R8_ZERO_IS_NEVER_SELECTED',
    coreAuthorityGranted:false,
  });
}
