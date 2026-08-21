import { BrowserOnnxSessionFactory } from '../platform/creative/local-ai/browser/BrowserOnnxSessionFactory';
import { BrowserImageArtifactResolver, MobileSamBrowserSegmentation } from '../platform/creative/local-ai/browser/MobileSamBrowserSegmentation';

let productionSegmentation: MobileSamBrowserSegmentation | undefined;
const imageArtifacts = new BrowserImageArtifactResolver();
export function createSelectionSegmentation(source?: Readonly<{ imageArtifactId: string; source: string | Blob }>) {
  if (source) imageArtifacts.register(source.imageArtifactId, source.source);
  return productionSegmentation ??= new MobileSamBrowserSegmentation(new BrowserOnnxSessionFactory(), undefined, undefined, imageArtifacts);
}
