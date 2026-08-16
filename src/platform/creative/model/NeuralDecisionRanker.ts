import { clamp, immutable, round } from './immutable';
import type { DecisionRepresentation, NeuralDecisionRanker } from './v2-types';

export interface NeuralRankerConfig {
  readonly inputSize: number;
  readonly hiddenSize?: number;
  readonly learningRate?: number;
  readonly epochs?: number;
  readonly seed?: number;
  readonly version?: string;
}

const sigmoid = (value: number): number => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, value))));
const tanhDerivative = (activation: number): number => 1 - activation * activation;

/** A small, dependency-free MLP trained with pairwise logistic and listwise softmax loss. */
export class CompactNeuralDecisionRanker implements NeuralDecisionRanker {
  private readonly inputSize: number;
  private readonly hiddenSize: number;
  private readonly learningRate: number;
  private readonly epochs: number;
  private readonly modelVersion: string;
  private hiddenWeights: number[][];
  private hiddenBias: number[];
  private outputWeights: number[];
  private outputBias = 0;

  constructor(config: NeuralRankerConfig) {
    if (!Number.isInteger(config.inputSize) || config.inputSize <= 0) throw new Error('inputSize must be positive');
    this.inputSize = config.inputSize;
    this.hiddenSize = config.hiddenSize ?? 12;
    this.learningRate = config.learningRate ?? 0.025;
    this.epochs = config.epochs ?? 24;
    this.modelVersion = config.version ?? 'neural-ranker-v2';
    let state = config.seed ?? 17;
    const random = () => { state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0; return state / 4_294_967_296; };
    const scale = Math.sqrt(6 / (this.inputSize + this.hiddenSize));
    this.hiddenWeights = Array.from({ length: this.hiddenSize }, () => Array.from({ length: this.inputSize }, () => (random() * 2 - 1) * scale));
    this.hiddenBias = Array(this.hiddenSize).fill(0);
    this.outputWeights = Array.from({ length: this.hiddenSize }, () => (random() * 2 - 1) * Math.sqrt(6 / (this.hiddenSize + 1)));
  }

  score(representation: DecisionRepresentation): number {
    this.assertSize(representation.values);
    return round(this.forward(representation.values).score);
  }

  compare(a: DecisionRepresentation, b: DecisionRepresentation): number {
    return round(sigmoid(this.score(a) - this.score(b)));
  }

  trainPairwise(examples: readonly Readonly<{ preferred: DecisionRepresentation; other: DecisionRepresentation; weight?: number }>[]): void {
    for (let epoch = 0; epoch < this.epochs; epoch++) {
      for (const example of examples) {
        this.assertSize(example.preferred.values);
        this.assertSize(example.other.values);
        const preferred = this.forward(example.preferred.values);
        const other = this.forward(example.other.values);
        const gradient = (sigmoid(preferred.score - other.score) - 1) * clamp(example.weight ?? 1, 0, 10);
        this.backprop(example.preferred.values, preferred.hidden, gradient);
        this.backprop(example.other.values, other.hidden, -gradient);
      }
    }
  }

  trainListwise(examples: readonly Readonly<{ representations: readonly DecisionRepresentation[]; relevance: readonly number[] }>[]): void {
    for (let epoch = 0; epoch < this.epochs; epoch++) {
      for (const example of examples) {
        if (example.representations.length !== example.relevance.length) throw new Error('Listwise relevance length mismatch');
        if (example.representations.length < 2) continue;
        const forwards = example.representations.map((item) => { this.assertSize(item.values); return this.forward(item.values); });
        const predicted = this.softmax(forwards.map((item) => item.score));
        const target = this.softmax(example.relevance);
        example.representations.forEach((representation, index) => this.backprop(representation.values, forwards[index].hidden, predicted[index] - target[index]));
      }
    }
  }

  version(): string { return this.modelVersion; }

  snapshot(): Readonly<{ version: string; weights: readonly number[]; bias: number }> {
    return immutable({
      version: this.modelVersion,
      weights: [...this.hiddenWeights.flat(), ...this.hiddenBias, ...this.outputWeights].map(round),
      bias: round(this.outputBias),
    });
  }

  private forward(values: readonly number[]): { hidden: number[]; score: number } {
    const hidden = this.hiddenWeights.map((weights, row) => Math.tanh(weights.reduce((sum, weight, column) => sum + weight * values[column], this.hiddenBias[row])));
    const score = hidden.reduce((sum, activation, index) => sum + activation * this.outputWeights[index], this.outputBias);
    return { hidden, score };
  }

  private backprop(values: readonly number[], hidden: readonly number[], scoreGradient: number): void {
    const outputBefore = [...this.outputWeights];
    for (let row = 0; row < this.hiddenSize; row++) {
      this.outputWeights[row] -= this.learningRate * scoreGradient * hidden[row];
      const hiddenGradient = scoreGradient * outputBefore[row] * tanhDerivative(hidden[row]);
      this.hiddenBias[row] -= this.learningRate * hiddenGradient;
      for (let column = 0; column < this.inputSize; column++) this.hiddenWeights[row][column] -= this.learningRate * hiddenGradient * values[column];
    }
    this.outputBias -= this.learningRate * scoreGradient;
  }

  private softmax(values: readonly number[]): number[] {
    const maximum = Math.max(...values);
    const exponentials = values.map((value) => Math.exp(value - maximum));
    const total = exponentials.reduce((sum, value) => sum + value, 0);
    return exponentials.map((value) => value / total);
  }

  private assertSize(values: readonly number[]): void {
    if (values.length !== this.inputSize) throw new Error(`Expected ${this.inputSize} representation values, received ${values.length}`);
  }
}
