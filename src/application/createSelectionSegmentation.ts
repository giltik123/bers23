import { coreClient } from '../api/coreClient';
import { CoreAuthorizedSegmentation } from './selection/CoreAuthorizedSegmentation';
import { BrowserOnnxSessionFactory } from '../platform/creative/local-ai/browser/BrowserOnnxSessionFactory';
import { BrowserImageArtifactResolver, MobileSamBrowserSegmentation } from '../platform/creative/local-ai/browser/MobileSamBrowserSegmentation';

let productionSegmentation: MobileSamBrowserSegmentation | undefined;
const imageArtifacts = new BrowserImageArtifactResolver();
export function createSelectionSegmentation(source: Readonly<{ projectId?: string; imageArtifactId: string; source: string | Blob }>) {
  const projectId = source?.projectId?.trim() || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('id')?.trim() : undefined);
  if (!projectId || !source?.imageArtifactId) throw new Error('Canonical project and image identity are required for selection');
  imageArtifacts.register(source.imageArtifactId, source.source);
  const local = productionSegmentation ??= new MobileSamBrowserSegmentation(new BrowserOnnxSessionFactory(), undefined, undefined, imageArtifacts);
  return new CoreAuthorizedSegmentation(projectId, local, coreClient.localExecution);
}
