import { clamp, immutable } from "./immutable";
import type { SynergyResult } from "./refinementTypes";

const synergies = [{ operations: ["lighting", "contrast", "color_balance"], bonus: .12 },
  { operations: ["exposure", "white_balance"], bonus: .06 }, { operations: ["segmentation", "ai:try-on"], bonus: .08 }];
export class OperationSynergyCalculator {
  calculate(operations: readonly string[], individualGains: Readonly<Record<string, number>> = {}): SynergyResult {
    const round = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
    const baseGain = round(operations.reduce((sum, operation) => sum + (individualGains[operation] ?? .03), 0));
    const active = synergies.filter(({ operations: required }) => required.every((item) => operations.includes(item)));
    const synergyBonus = round(active.reduce((sum, { bonus }) => sum + bonus, 0));
    return immutable({ baseGain: clamp(baseGain), synergyBonus: clamp(synergyBonus), totalGain: clamp(round(baseGain + synergyBonus)),
      combinations: active.map(({ operations: items }) => items.join(" + ")) });
  }
}
