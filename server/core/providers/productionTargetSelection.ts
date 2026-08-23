import type { TargetSelectorPort } from '../../../src/platform/creative/canonical/contracts.ts';

export const PRODUCTION_TARGET_SELECTION_VERSION = '6.41C4.1';
/** Pure target policy; BLOCKED is the fail-closed default. */
export const productionTargetSelection: TargetSelectorPort = Object.freeze({
  select(operation) {
    if (operation.type === 'image-edit' || operation.type === 'CONTROLLED_LOCAL_EDIT') return 'CLOUD';
    if (operation.type === 'verify') return 'LOCAL';
    return 'BLOCKED';
  },
});
