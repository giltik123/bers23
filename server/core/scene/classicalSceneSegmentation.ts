import sharp from 'sharp';

/**
 * Classical, fully deterministic color-region segmentation.
 *
 * Not semantic understanding: never labels a region FACE / GARMENT / ACCESSORY.
 * Works best on a foreground with color/contrast separation from the frame.
 * The algorithm is a small seeded RGB k-means + four-neighbour connected
 * components + border-connected approximate background, with bounded memory.
 * It does not call a model, the network or Billing.
 */
export type ClassicalRegion = Readonly<{
  category:'BACKGROUND'|'OTHER_OBJECT';
  group:'BACKGROUND'|'OTHER_OBJECT';
  label:string;
  confidence:0;
  alpha:Uint8Array;
  modelId:'bers-classical-cv';
  modelVersion:'color-connected-components-v1';
}>;
export const CLASSICAL_SCENE_MAX_DIMENSION=384;
const MAX_PIXELS=8_000_000;
const MAX_INSTANCES=12;
const MIN_REGION_RATIO=0.012;
const MODEL_ID='bers-classical-cv' as const;
const MODEL_VERSION='color-connected-components-v1' as const;

function sqDistance(data:Uint8Array,index:number,color:readonly number[]) {
  const d0=data[index]-color[0],d1=data[index+1]-color[1],d2=data[index+2]-color[2];
  return d0*d0+d1*d1+d2*d2;
}

/** Pure function for fixture testing and non-image source adapters. */
export function partitionClassicalColorRegions(
  rgba:Uint8Array,width:number,height:number,
): Readonly<{ labels:Int16Array; backgroundLabel:number; regions:ReadonlyArray<Readonly<{
  category:'BACKGROUND'|'OTHER_OBJECT'; label:string; pixels:Uint8Array; area:number;
}>> }> {
  const pixelCount=width*height;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||
     width<8||height<8||pixelCount>CLASSICAL_SCENE_MAX_DIMENSION**2||
     rgba.length!==pixelCount*4)
    throw new Error('Classical segmentation input geometry is invalid');
  // Smooth low-amplitude sensor/JPEG noise before clustering.
  const rgb=new Uint8Array(pixelCount*3);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let r=0,g=0,b=0,n=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const yy=Math.max(0,Math.min(height-1,y+dy));
      const xx=Math.max(0,Math.min(width-1,x+dx));
      const i=(yy*width+xx)*4;
      r+=rgba[i];g+=rgba[i+1];b+=rgba[i+2];n++;
    }
    const p=(y*width+x)*3;
    rgb[p]=Math.round(r/n);rgb[p+1]=Math.round(g/n);rgb[p+2]=Math.round(b/n);
  }
  // Deterministic farthest-color seeding. No entropy, ML, cloud or pretrained weights.
  const centers:number[][]=[];
  const first=[rgb[0],rgb[1],rgb[2]];
  centers.push(first);
  const seedStride=Math.max(1,Math.floor(pixelCount/2048));
  for(let cluster=1;cluster<7;cluster++){
    let best=-1,bestPixel=-1;
    for(let i=0;i<pixelCount;i+=seedStride){
      const j=i*3;
      let nearest=Infinity;
      for(const center of centers)nearest=Math.min(nearest,sqDistance(rgb,j,center));
      if(nearest>best){best=nearest;bestPixel=j;}
    }
    // A flat-color photograph has no objects to segment.
    if(best<20||bestPixel<0)break;
    centers.push([rgb[bestPixel],rgb[bestPixel+1],rgb[bestPixel+2]]);
  }
  const labels=new Int16Array(pixelCount);
  for(let pass=0;pass<5;pass++){
    const sums=centers.map(()=>[0,0,0,0]);
    for(let i=0;i<pixelCount;i++){
      const p=i*3;
      let chosen=0,dist=Infinity;
      for(let k=0;k<centers.length;k++){
        const d=sqDistance(rgb,p,centers[k]);
        if(d<dist){dist=d;chosen=k;}
      }
      labels[i]=chosen;
      const sum=sums[chosen];sum[0]+=rgb[p];sum[1]+=rgb[p+1];
      sum[2]+=rgb[p+2];sum[3]++;
    }
    for(let k=0;k<centers.length;k++){
      const [r,g,b,count]=sums[k];
      if(count){centers[k]=[r/count,g/count,b/count];}
    }
  }
  // Final stable assignment after the last centroid update.
  for(let i=0;i<pixelCount;i++){
    const p=i*3;let chosen=0,dist=Infinity;
    for(let k=0;k<centers.length;k++){
      const d=sqDistance(rgb,p,centers[k]);
      if(d<dist){dist=d;chosen=k;}
    }
    labels[i]=chosen;
  }

  const borderCounts=new Uint32Array(centers.length);
  for(let x=0;x<width;x++){
    borderCounts[labels[x]]++;borderCounts[labels[(height-1)*width+x]]++;
  }
  for(let y=1;y<height-1;y++){
    borderCounts[labels[y*width]]++;
    borderCounts[labels[y*width+width-1]]++;
  }
  let borderLabel=0;
  for(let k=1;k<borderCounts.length;k++){
    if(borderCounts[k]>borderCounts[borderLabel])borderLabel=k;
  }
  // Four-connected components prevent mixing separated same-color objects.
  const visited=new Uint8Array(pixelCount);
  const queue=new Int32Array(pixelCount);
  const minArea=Math.max(8,Math.ceil(pixelCount*MIN_REGION_RATIO));
  const found:{cluster:number;size:number;touchesBorder:boolean;cells:number[]}[]=[];
  for(let origin=0;origin<pixelCount;origin++){
    if(visited[origin])continue;
    const cluster=labels[origin];
    let head=0,tail=1;queue[0]=origin;visited[origin]=1;
    const cells:number[]=[];
    let onBorder=false;
    while(head<tail){
      const index=queue[head++];
      const x=index%width,y=(index-x)/width;
      if(x===0||y===0||x===width-1||y===height-1)onBorder=true;
      cells.push(index);
      const neighbors=[
        x>0?index-1:-1,x<width-1?index+1:-1,
        y>0?index-width:-1,y<height-1?index+width:-1,
      ];
      for(const j of neighbors){
        if(j>=0 && !visited[j] && labels[j]===cluster){
          visited[j]=1;queue[tail++]=j;
        }
      }
    }
    if(cells.length>=minArea)found.push({
      cluster,size:cells.length,touchesBorder:onBorder,cells,
    });
  }
  const backgrounds=found.filter(c=>c.cluster===borderLabel && c.touchesBorder);
  const backgroundPixels=backgrounds.reduce((a,c)=>a+c.size,0);
  const validBackground=backgroundPixels>=pixelCount*.10 && backgroundPixels<=pixelCount*.95;
  const regions:{category:'BACKGROUND'|'OTHER_OBJECT';label:string;pixels:Uint8Array;area:number}[]=[];
  if(validBackground){
    const pixels=new Uint8Array(pixelCount);
    for(const component of backgrounds)for(const i of component.cells)pixels[i]=255;
    regions.push({category:'BACKGROUND',label:'Фон (цветовая оценка)',pixels,area:backgroundPixels});
  }
  const components=found.filter(c=>!(validBackground && c.cluster===borderLabel && c.touchesBorder)
    && c.size<=pixelCount*.85).sort((a,b)=>b.size-a.size);
  for(const component of components.slice(0,MAX_INSTANCES-regions.length)){
    const pixels=new Uint8Array(pixelCount);
    for(const i of component.cells)pixels[i]=255;
    regions.push({
      category:'OTHER_OBJECT',label:`Цветовая область ${regions.filter(x=>x.category==='OTHER_OBJECT').length+1}`,
      pixels,area:component.size,
    });
  }
  return Object.freeze({labels,backgroundLabel:borderLabel,regions});
}

export async function runClassicalSceneSegmentation(input:Readonly<{
  imagePng:Uint8Array;width:number;height:number;
}>):Promise<Readonly<{instances:readonly ClassicalRegion[];modelId:string;modelVersion:string}>> {
  const {width,height}=input;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||
    width<8||height<8||width*height>MAX_PIXELS||!input.imagePng?.byteLength)
    throw Object.assign(new Error('Classical segmentation requires an 8×8+ bounded canonical photo'),
      {status:422,code:'classical_scene_unsupported_geometry'});
  const source=sharp(Buffer.from(input.imagePng),{failOn:'error',limitInputPixels:MAX_PIXELS});
  const {data,info}=await source
    .resize({width:CLASSICAL_SCENE_MAX_DIMENSION,height:CLASSICAL_SCENE_MAX_DIMENSION,
      fit:'inside',withoutEnlargement:true})
    .toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const partition=partitionClassicalColorRegions(
    new Uint8Array(data),info.width,info.height,
  );
  const instances:ClassicalRegion[]=[];
  for(const region of partition.regions){
    const alpha=new Uint8Array(width*height);
    // Nearest-neighbor expansion of region labels, preserving canonical source
    // dimensions. This is an approximate boundary, not a pixel-perfect matte.
    const xMap=new Int32Array(width);
    for(let x=0;x<width;x++)xMap[x]=Math.min(info.width-1,Math.floor(x*info.width/width));
    for(let y=0;y<height;y++){
      const yy=Math.min(info.height-1,Math.floor(y*info.height/height));
      for(let x=0;x<width;x++){
        alpha[y*width+x]=region.pixels[yy*info.width+xMap[x]];
      }
    }
    instances.push({
      category:region.category,group:region.category,label:region.label,
      confidence:0,alpha,modelId:MODEL_ID,modelVersion:MODEL_VERSION,
    });
  }
  return Object.freeze({instances:Object.freeze(instances),
    modelId:MODEL_ID,modelVersion:MODEL_VERSION});
}
