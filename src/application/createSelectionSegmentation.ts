import { coreClient } from '../api/coreClient';
import { CoreAuthorizedSegmentation } from './selection/CoreAuthorizedSegmentation';
import { BrowserOnnxSessionFactory } from '../platform/creative/local-ai/browser/BrowserOnnxSessionFactory';
import { BrowserImageArtifactResolver, MobileSamBrowserSegmentation } from '../platform/creative/local-ai/browser/MobileSamBrowserSegmentation';
import { MOBILE_SAM_BROWSER_MODEL } from '../platform/creative/local-ai/browser/MobileSamCapability';
import { BrowserDeviceProvider, BrowserRuntimeProbe } from '../platform/creative/local-ai/device/BrowserDeviceCapabilities';
import { DeviceExecutionAdmission } from '../platform/creative/local-ai/selection/DeviceExecutionAdmission';

let productionSegmentation: MobileSamBrowserSegmentation | undefined;
const imageArtifacts = new BrowserImageArtifactResolver();
const deviceAdmission = new DeviceExecutionAdmission(new BrowserDeviceProvider(), new BrowserRuntimeProbe());

export function createSelectionSegmentation(source: Readonly<{ projectId?: string; imageArtifactId: string; source: string | Blob }>) {
  const projectId = source?.projectId?.trim() || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('id')?.trim() : undefined);
  if (!projectId || !source?.imageArtifactId) throw new Error('Canonical project and image identity are required for selection');
  imageArtifacts.register(source.imageArtifactId, source.source);
  const local = productionSegmentation ??= new MobileSamBrowserSegmentation(new BrowserOnnxSessionFactory(), undefined, undefined, imageArtifacts);
  let canonicalBlob: Blob | undefined;
  let canonicalHash: string | undefined;
  const inputIntegrity = Object.freeze({
    async sha256(artifactId: string) {
      if (artifactId !== source.imageArtifactId) throw new Error('Local input integrity requested for an unbound artifact');
      if (canonicalHash) return canonicalHash;
      canonicalBlob = canonicalBlob ?? await sourceBlob(source.source);
      const bytes = await canonicalBlob.arrayBuffer();
      canonicalHash = hex(await crypto.subtle.digest('SHA-256', bytes));
      imageArtifacts.register(source.imageArtifactId, canonicalBlob);
      return canonicalHash;
    },
  });
  return new CoreAuthorizedSegmentation(projectId, local, coreClient.localExecution, deviceAdmission, MOBILE_SAM_BROWSER_MODEL, inputIntegrity);
}

async function sourceBlob(source: string | Blob): Promise<Blob> {
  if (source instanceof Blob) return source;
  const response = await fetch(source, { credentials: 'include' });
  if (!response.ok) throw new Error(`Canonical selection source is unavailable (${response.status})`);
  return response.blob();
}
function hex(buffer: ArrayBuffer): string { return [...new Uint8Array(buffer)].map(value => value.toString(16).padStart(2, '0')).join(''); }
