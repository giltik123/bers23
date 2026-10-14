/**
 * Highlight-protected local tonal lift/rolloff — R&D, NOT accepted Exposure v1.
 *
 * A monotonic rational tone response is applied to *linear* sRGB luminance
 * proxy max(R,G,B). Its scale applies to all linear channels equally,
 * maintaining approximate hue/chroma ratios while keeping all components
 * below the original 1.0 display ceiling. Pixel-clipped highlights cannot
 * be restored by this tool; it avoids creating broad NEW clipped plateaus.
 *
 * Matte mixing occurs in linear-light RGB, with source alpha and out-of-mask
 * pixels copied byte-exact. This assumes Core has already converted the
 * source to canonical orientation-1 sRGB; NO ICC/CMS is done here.
 *
 * This is not physically accurate raw exposure or Photoshop Camera Raw.
 * A versioned Core source-bound edit + real photos/quality acceptance are
 * required before any production workflow uses these bytes.
 */
export type HighlightProtectedToneParametersRND = Readonly<{
  eighthStops: number;  // -32..+32; 1 eighth stop per integer
}>;
const MAX_PIXELS=4_194_304;
const lin=Float64Array.from({length:256},(_,v)=>{
  const s=v/255;
  return s<=0.04045?s/12.92:((s+0.055)/1.055)**2.4;
});
function encode(value:number):number {
  const c=Math.max(0,Math.min(1,value));
  return Math.round(255*(c<=0.0031308?12.92*c:1.055*c**(1/2.4)-0.055));
}
export function highlightProtectedToneRgba8RND(
  source:Uint8Array|Uint8ClampedArray,
  mask:Uint8Array|Uint8ClampedArray,
  width:number,height:number,
  params:HighlightProtectedToneParametersRND,
):Uint8ClampedArray {
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||
     width<1||height<1||width>4096||height>4096||width*height>MAX_PIXELS){
    throw new Error('Highlight Protected Tone image geometry exceeds R&D bounds');
  }
  const count=width*height;
  if(!(source instanceof Uint8Array||source instanceof Uint8ClampedArray)||
     source.byteLength!==count*4)throw new Error('Highlight Protected Tone expects exact RGBA8');
  if(!(mask instanceof Uint8Array||mask instanceof Uint8ClampedArray)||
     mask.byteLength!==count)throw new Error('Highlight Protected Tone expects exact R8 mask');
  if(!params||!Number.isSafeInteger(params.eighthStops)||
     params.eighthStops< -32||params.eighthStops>32){
    throw new Error('Highlight Protected Tone requires bounded eighth-stop integer');
  }
  const output=new Uint8ClampedArray(source);
  if(params.eighthStops===0)return output;
  const gain=2**(params.eighthStops/8);
  for(let pixel=0;pixel<count;pixel++){
    const coverage=mask[pixel]/255,offset=pixel*4;
    if(coverage===0||source[offset+3]===0)continue;
    const r=lin[source[offset]],g=lin[source[offset+1]],b=lin[source[offset+2]];
    const high=Math.max(r,g,b);
    if(high===0)continue;
    // f(0)=0, f(1)=1, f'(x)>0 for any admissible gain;
    // no display-clamping flat plateau. Preserves ratios in linear-light.
    const nextHigh=(high*gain)/(1+(gain-1)*high);
    const multiply=nextHigh/high;
    for(let channel=0;channel<3;channel++){
      const original=[r,g,b][channel];
      const adjusted=original*multiply;
      const mixed=original*(1-coverage)+adjusted*coverage;
      output[offset+channel]=encode(mixed);
    }
    // Original alpha remains unchanged even for masked corrections.
  }
  return output;
}
