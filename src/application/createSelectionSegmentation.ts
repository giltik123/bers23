import { coreClient } from '../api/coreClient';
import { browserLocalAIComposition } from './local-ai/BrowserLocalAIComposition';
import { CoreAuthorizedSegmentation } from './selection/CoreAuthorizedSegmentation';
import type { InteractiveSegmentationPort } from './selection/contracts';
import { MOBILE_SAM_BROWSER_MODEL } from '../platform/creative/local-ai/browser/MobileSamCapability';
import type { OnnxSessionFactory } from '../platform/creative/local-ai/types';

let productionRuntime: Promise<Readonly<{
  local: InteractiveSegmentationPort;
  imageArtifacts: Readonly<{ register(artifactId: string, source: string | Blob): void }>;
}>> | undefined;

export function createSelectionSegmentation(source: Readonly<{ projectId?: string; imageArtifactId: string; source: string | Blob }>): InteractiveSegmentationPort {
  const projectId = source?.projectId?.trim() || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('id')?.trim() : undefined);
  if (!projectId || !source?.imageArtifactId) throw new Error('Canonical project and image identity are required for selection');

  let delegate: CoreAuthorizedSegmentation | undefined;
  let pendingDelegate: Promise<CoreAuthorizedSegmentation> | undefined;
  const cancelled = new Set<string>();
  let canonicalBlob: Blob | undefined;
  let canonicalHash: string | undefined;

  const inputIntegrity = Object.freeze({
    async sha256(artifactId: string) {
      if (artifactId !== source.imageArtifactId) throw new Error('Local input integrity requested for an unbound artifact');
      if (canonicalHash) return canonicalHash;
      canonicalBlob = canonicalBlob ?? await sourceBlob(source.source);
      const bytes = await canonicalBlob.arrayBuffer();
      canonicalHash = hex(await crypto.subtle.digest('SHA-256', bytes));
      const runtime = await getProductionRuntime((await browserLocalAIComposition.get()).onnxSessionFactory);
      runtime.imageArtifacts.register(source.imageArtifactId, canonicalBlob);
      return canonicalHash;
    },
  });

  const ensureDelegate = async () => {
    if (delegate) return delegate;
    if (pendingDelegate) return pendingDelegate;
    pendingDelegate = (async () => {
      const composition = await browserLocalAIComposition.get();
      // Preflight is advisory and grants no Core authority. It deliberately blocks the current
      // CANDIDATE MobileSAM descriptor before any ticket or inference side effect.
      const preflight = await composition.deviceAdmission.admit(MOBILE_SAM_BROWSER_MODEL, ['INTERACTIVE_SEGMENTATION'], 'LOCAL_ONLY');
      if (preflight.allowed === false) throw new Error(`Local semantic capability unavailable: ${preflight.reasons.join('; ') || 'device/model admission denied'}`);
      const runtime = await getProductionRuntime(composition.onnxSessionFactory);
      runtime.imageArtifacts.register(source.imageArtifactId, canonicalBlob ?? source.source);
      delegate = new CoreAuthorizedSegmentation(projectId, runtime.local, coreClient.localExecution, composition.deviceAdmission, MOBILE_SAM_BROWSER_MODEL, inputIntegrity);
      return delegate;
    })().catch((error) => {
      pendingDelegate = undefined;
      throw error;
    });
    return pendingDelegate;
  };

  return Object.freeze({
    async segment(input) {
      if (cancelled.delete(input.requestId)) throw new Error('Inference cancelled');
      const target = await ensureDelegate();
      if (cancelled.delete(input.requestId)) {
        target.cancel(input.requestId);
        throw new Error('Inference cancelled');
      }
      return target.segment(input);
    },
    cancel(requestId: string) {
      if (!requestId) return;
      cancelled.add(requestId);
      delegate?.cancel(requestId);
    },
  });
}

async function getProductionRuntime(sessionFactory: OnnxSessionFactory) {
  return productionRuntime ??= (async () => {
    const { BrowserImageArtifactResolver, MobileSamBrowserSegmentation } = await import('../platform/creative/local-ai/browser/MobileSamBrowserSegmentation');
    const imageArtifacts = new BrowserImageArtifactResolver();
    const local = new MobileSamBrowserSegmentation(sessionFactory, undefined, undefined, imageArtifacts);
    return Object.freeze({ local, imageArtifacts });
  })();
}

async function sourceBlob(source: string | Blob): Promise<Blob> {
  if (source instanceof Blob) return source;
  const response = await fetch(source, { credentials: 'include' });
  if (!response.ok) throw new Error(`Canonical selection source is unavailable (${response.status})`);
  return response.blob();
}
function hex(buffer: ArrayBuffer): string { return [...new Uint8Array(buffer)].map(value => value.toString(16).padStart(2, '0')).join(''); }
