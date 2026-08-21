import { BrowserOnnxSessionFactory } from '../platform/creative/local-ai/browser/BrowserOnnxSessionFactory';
import { MobileSamBrowserSegmentation } from '../platform/creative/local-ai/browser/MobileSamBrowserSegmentation';

let productionSegmentation: MobileSamBrowserSegmentation | undefined;
export function createSelectionSegmentation() { return productionSegmentation ??= new MobileSamBrowserSegmentation(new BrowserOnnxSessionFactory()); }
