import { immutableOperationClone } from '../immutable';
import type { ExecutionEnvironmentProvider, OperationDecision, OperationDescriptor, OperationScope } from '../types';

export class OperationPolicyResolver {
  constructor(private readonly environments: ExecutionEnvironmentProvider) {}

  resolve(descriptor: OperationDescriptor, scope: OperationScope): OperationDecision {
    const local = descriptor.supportsLocal && this.environments.localAvailable(scope);
    const cloud = descriptor.supportsCloud && this.environments.cloudAvailable(scope);
    let route: OperationDecision['route'] = 'NONE';

    if (descriptor.executionPolicy === 'LOCAL_ONLY' || descriptor.executionPolicy === 'LOCAL_PREFERRED') {
      route = local ? 'LOCAL' : descriptor.executionPolicy === 'LOCAL_PREFERRED' && cloud ? 'CLOUD' : 'NONE';
    } else if (descriptor.executionPolicy === 'CLOUD_ONLY' || descriptor.executionPolicy === 'CLOUD_PREFERRED') {
      route = cloud ? 'CLOUD' : descriptor.executionPolicy === 'CLOUD_PREFERRED' && local ? 'LOCAL' : 'NONE';
    } else if (local && cloud) {
      route = 'HYBRID';
    } else {
      route = local ? 'LOCAL' : cloud ? 'CLOUD' : 'NONE';
    }

    return immutableOperationClone({
      operationId: descriptor.operationId,
      selected: route !== 'NONE',
      route,
      reason: route === 'NONE'
        ? `No execution environment satisfies ${descriptor.executionPolicy}`
        : `${route} satisfies ${descriptor.executionPolicy}`,
      rejectedAlternatives: [],
    });
  }
}
