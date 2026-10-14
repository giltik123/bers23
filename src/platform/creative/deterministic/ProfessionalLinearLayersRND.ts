/**
 * High-fidelity local layer blending candidate — NON-PRODUCTION / R&D.
 *
 * Correct alpha source-over in linear-light sRGB D65 with R8 edit matte and
 * Q8 opacity. This is intentionally distinct from the accepted sRGB-byte
 * layer prototype. All non-overlap/zero-mask pixels remain RGBA byte-exact.
 * RGB of an actually composited pixel with alpha zero is set to zero; hidden
 * RGB of untouched pixels is preserved.
 *
 * No Core, Project, user, ICC, paid model, remote API or FINAL admission here.
 */
export type LinearLightRasterLayerRND = Readonly<{
  id: string;
  pixels: Uint8Array | Uint8ClampedArray;
  mask?: Uint8Array | Uint8ClampedArray;
  opacityQ8: number;
  visible: boolean;
  blendMode: 'NORMAL';
}>;

const MAX_PIXELS=4_194_304;
const MAX_VISITS=32_000_000;
const srgbToLinear=Float64Array.from({length:256},(_,value)=>{
  const channel=value/255;
  return channel<=0.04045?channel/12.92:((channel+0.055)/1.055)**2.4;
});
function srgbByte(linear:number):number {
  const v=Math.max(0,Math.min(1,linear));
  return Math.round(255*(v<=0.0031308?12.92*v:1.055*v**(1/2.4)-0.055));
}
function rgba(value:unknown,length:number):asserts value is Uint8Array|Uint8ClampedArray {
  if (!(value instanceof Uint8Array||value instanceof Uint8ClampedArray)||value.byteLength!==length){
    throw new Error('Linear layer compositor requires exact RGBA8 image bytes');
  }
}
export function composeLinearLightLayersRgba8RND(
  source:Uint8Array|Uint8ClampedArray,
  width:number,height:number,
  layers:readonly LinearLightRasterLayerRND[],
):Uint8ClampedArray {
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||
     width<1||height<1||width>4096||height>4096||width*height>MAX_PIXELS){
    throw new Error('Linear layer compositor image geometry exceeds bounds');
  }
  if(!Array.isArray(layers)||layers.length>16||width*height*layers.length>MAX_VISITS){
    throw new Error('Linear layer compositor processing budget exceeded');
  }
  rgba(source,width*height*4);
  const identities=new Set<string>();
  for(const layer of layers){
    if(!layer||typeof layer.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(layer.id)||
       identities.has(layer.id))throw new Error('Linear layer identity invalid/duplicate');
    identities.add(layer.id);
    if(layer.blendMode!=='NORMAL'||typeof layer.visible!=='boolean'||
       !Number.isSafeInteger(layer.opacityQ8)||layer.opacityQ8<0||layer.opacityQ8>255){
      throw new Error('Linear layer mode/opacity/visibility unsupported');
    }
    rgba(layer.pixels,width*height*4);
    if(layer.mask!==undefined &&
      (!(layer.mask instanceof Uint8Array||layer.mask instanceof Uint8ClampedArray)||
       layer.mask.byteLength!==width*height)){
      throw new Error('Linear layer R8 mask geometry invalid');
    }
  }
  const result=new Uint8ClampedArray(source);
  for(const layer of layers){
    if(!layer.visible||layer.opacityQ8===0)continue;
    for(let pixel=0;pixel<width*height;pixel++){
      const offset=pixel*4;
      const matte=layer.mask===undefined?255:layer.mask[pixel];
      if(matte===0||layer.pixels[offset+3]===0)continue;
      const aboveAlpha=(layer.pixels[offset+3]/255)*(layer.opacityQ8/255)*(matte/255);
      if(aboveAlpha<1/1e9)continue;
      const belowAlpha=result[offset+3]/255;
      const nextAlpha=aboveAlpha+belowAlpha*(1-aboveAlpha);
      if(nextAlpha===0)continue;
      if(aboveAlpha===1){
        // Replacement should be byte-exact, not through sRGB numerical round trips.
        result.set(layer.pixels.subarray(offset,offset+4),offset);
        continue;
      }
      const foreground=aboveAlpha/nextAlpha;
      const background=(belowAlpha*(1-aboveAlpha))/nextAlpha;
      for(let channel=0;channel<3;channel++){
        const aboveLinear=srgbToLinear[layer.pixels[offset+channel]];
        const belowLinear=srgbToLinear[result[offset+channel]];
        result[offset+channel]=srgbByte(aboveLinear*foreground+belowLinear*background);
      }
      result[offset+3]=Math.round(nextAlpha*255);
    }
  }
  return result;
}
