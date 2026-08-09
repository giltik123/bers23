import { immutable } from "./immutable";
import type { DecisionDebugSnapshot } from "./types";

export class DecisionDebugger {
  snapshot(value: DecisionDebugSnapshot): DecisionDebugSnapshot {
    return immutable(structuredClone(value));
  }
}
