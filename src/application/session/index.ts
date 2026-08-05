export * from './AIProjectSession';
export * from './AIActionHistory';
export * from './ProductSessionManager';

import { ProductSessionManager } from './ProductSessionManager';

export const session = new ProductSessionManager();
