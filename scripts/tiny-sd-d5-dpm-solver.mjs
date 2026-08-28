const f32 = Math.fround;

const requireFinite = (value, label) => {
  if (!Number.isFinite(value)) throw new Error(`${label} is not finite: ${value}`);
  return value;
};

const roundTiesToEven = value => {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction < 0.5) return floor;
  if (fraction > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
};

const linspaceF32 = (start, end, count) => {
  if (!Number.isInteger(count) || count < 2) throw new Error(`invalid linspace count: ${count}`);
  const out = new Float32Array(count);
  const span = end - start;
  for (let index = 0; index < count; index++) out[index] = f32(start + span * (index / (count - 1)));
  out[0] = f32(start);
  out[count - 1] = f32(end);
  return out;
};

const sameLength = (a, b, label) => {
  if (a.length !== b.length) throw new Error(`${label} length mismatch: ${a.length} != ${b.length}`);
};

const map2 = (a, b, operation, label) => {
  sameLength(a, b, label);
  const out = new Float32Array(a.length);
  for (let index = 0; index < a.length; index++) out[index] = f32(operation(a[index], b[index], index));
  return out;
};

export class TinySdDpmSolverMultistep {
  constructor(config) {
    const required = {
      algorithm_type: 'dpmsolver++',
      beta_schedule: 'scaled_linear',
      prediction_type: 'epsilon',
      solver_order: 2,
      solver_type: 'midpoint',
      thresholding: false,
      use_karras_sigmas: false,
      timestep_spacing: 'linspace',
    };
    for (const [key, expected] of Object.entries(required)) {
      if (config?.[key] !== expected) throw new Error(`unsupported Tiny-SD scheduler ${key}: ${config?.[key]}`);
    }
    if (!config.lower_order_final) throw new Error('Tiny-SD D5 requires lower_order_final=true');
    if (!Number.isInteger(config.num_train_timesteps) || config.num_train_timesteps <= 1) throw new Error('invalid num_train_timesteps');
    if (config.trained_betas != null) throw new Error('trained_betas is not supported by Tiny-SD D5 control proof');

    this.config = Object.freeze({ ...config });
    const roots = linspaceF32(Math.sqrt(config.beta_start), Math.sqrt(config.beta_end), config.num_train_timesteps);
    this.betas = new Float32Array(roots.length);
    this.alphaT = new Float32Array(roots.length);
    this.sigmaT = new Float32Array(roots.length);
    this.lambdaT = new Float32Array(roots.length);
    let cumulative = f32(1);
    for (let index = 0; index < roots.length; index++) {
      const beta = f32(roots[index] * roots[index]);
      const alpha = f32(1 - beta);
      cumulative = f32(cumulative * alpha);
      const alphaT = f32(Math.sqrt(cumulative));
      const sigmaT = f32(Math.sqrt(f32(1 - cumulative)));
      this.betas[index] = beta;
      this.alphaT[index] = alphaT;
      this.sigmaT[index] = sigmaT;
      this.lambdaT[index] = f32(f32(Math.log(alphaT)) - f32(Math.log(sigmaT)));
    }
    this.timesteps = [];
    this.modelOutputs = [null, null];
    this.lowerOrderNums = 0;
  }

  setTimesteps(numInferenceSteps) {
    if (!Number.isInteger(numInferenceSteps) || numInferenceSteps < 1) throw new Error(`invalid inference steps: ${numInferenceSteps}`);
    const lastTimestep = this.config.num_train_timesteps;
    const forward = new Array(numInferenceSteps + 1);
    for (let index = 0; index <= numInferenceSteps; index++) {
      const raw = (lastTimestep - 1) * (index / numInferenceSteps);
      forward[index] = roundTiesToEven(raw);
    }
    const reversed = forward.reverse().slice(0, -1);
    const seen = new Set();
    this.timesteps = reversed.filter(value => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
    this.modelOutputs = [null, null];
    this.lowerOrderNums = 0;
    return [...this.timesteps];
  }

  scaleModelInput(sample) {
    return new Float32Array(sample);
  }

  convertModelOutput(modelOutput, timestep, sample) {
    if (!Number.isInteger(timestep) || timestep < 0 || timestep >= this.alphaT.length) throw new Error(`invalid timestep: ${timestep}`);
    const alpha = this.alphaT[timestep];
    const sigma = this.sigmaT[timestep];
    return map2(sample, modelOutput, (sampleValue, modelValue) => {
      const noise = f32(sigma * modelValue);
      return f32(f32(sampleValue - noise) / alpha);
    }, 'convertModelOutput');
  }

  firstOrderUpdate(modelOutput, timestep, prevTimestep, sample) {
    const lambdaT = this.lambdaT[prevTimestep];
    const lambdaS = this.lambdaT[timestep];
    const alphaT = this.alphaT[prevTimestep];
    const sigmaT = this.sigmaT[prevTimestep];
    const sigmaS = this.sigmaT[timestep];
    const h = f32(lambdaT - lambdaS);
    const sampleScale = f32(sigmaT / sigmaS);
    const modelScale = f32(alphaT * f32(f32(Math.exp(-h)) - 1));
    const out = new Float32Array(sample.length);
    for (let index = 0; index < sample.length; index++) {
      out[index] = f32(f32(sampleScale * sample[index]) - f32(modelScale * modelOutput[index]));
    }
    return out;
  }

  secondOrderUpdate(modelOutputList, timestepList, prevTimestep, sample) {
    const s0 = timestepList.at(-1);
    const s1 = timestepList.at(-2);
    const m0 = modelOutputList.at(-1);
    const m1 = modelOutputList.at(-2);
    if (!(m0 instanceof Float32Array) || !(m1 instanceof Float32Array)) throw new Error('second-order update requires two model outputs');
    sameLength(m0, m1, 'secondOrderUpdate model outputs');
    sameLength(m0, sample, 'secondOrderUpdate sample');

    const lambdaT = this.lambdaT[prevTimestep];
    const lambdaS0 = this.lambdaT[s0];
    const lambdaS1 = this.lambdaT[s1];
    const alphaT = this.alphaT[prevTimestep];
    const sigmaT = this.sigmaT[prevTimestep];
    const sigmaS0 = this.sigmaT[s0];
    const h = f32(lambdaT - lambdaS0);
    const h0 = f32(lambdaS0 - lambdaS1);
    const r0 = f32(h0 / h);
    const sampleScale = f32(sigmaT / sigmaS0);
    const exponential = f32(f32(Math.exp(-h)) - 1);
    const d0Scale = f32(alphaT * exponential);
    const d1Scale = f32(0.5 * d0Scale);

    const out = new Float32Array(sample.length);
    for (let index = 0; index < sample.length; index++) {
      const d0 = m0[index];
      const d1 = f32(f32(m0[index] - m1[index]) / r0);
      out[index] = f32(
        f32(f32(sampleScale * sample[index]) - f32(d0Scale * d0)) - f32(d1Scale * d1),
      );
    }
    return out;
  }

  step(modelOutputInput, timestep, sampleInput) {
    const sample = sampleInput instanceof Float32Array ? sampleInput : Float32Array.from(sampleInput);
    const modelOutput = modelOutputInput instanceof Float32Array ? modelOutputInput : Float32Array.from(modelOutputInput);
    sameLength(sample, modelOutput, 'scheduler step');
    if (this.timesteps.length === 0) throw new Error('setTimesteps must be called before step');
    let stepIndex = this.timesteps.indexOf(Number(timestep));
    if (stepIndex < 0) stepIndex = this.timesteps.length - 1;
    const prevTimestep = stepIndex === this.timesteps.length - 1 ? 0 : this.timesteps[stepIndex + 1];
    const lowerOrderFinal = stepIndex === this.timesteps.length - 1 && this.config.lower_order_final && this.timesteps.length < 15;
    const lowerOrderSecond = stepIndex === this.timesteps.length - 2 && this.config.lower_order_final && this.timesteps.length < 15;
    const converted = this.convertModelOutput(modelOutput, Number(timestep), sample);
    this.modelOutputs[0] = this.modelOutputs[1];
    this.modelOutputs[1] = converted;

    let prevSample;
    let orderUsed;
    if (this.config.solver_order === 1 || this.lowerOrderNums < 1 || lowerOrderFinal) {
      prevSample = this.firstOrderUpdate(converted, Number(timestep), Number(prevTimestep), sample);
      orderUsed = 1;
    } else if (this.config.solver_order === 2 || this.lowerOrderNums < 2 || lowerOrderSecond) {
      const timestepList = [this.timesteps[stepIndex - 1], Number(timestep)];
      prevSample = this.secondOrderUpdate(this.modelOutputs, timestepList, Number(prevTimestep), sample);
      orderUsed = 2;
    } else {
      throw new Error('Tiny-SD D5 only permits solver_order=2');
    }
    if (this.lowerOrderNums < this.config.solver_order) this.lowerOrderNums += 1;
    for (let index = 0; index < prevSample.length; index++) requireFinite(prevSample[index], `scheduler output[${index}]`);
    return { prevSample, orderUsed, prevTimestep: Number(prevTimestep) };
  }
}

export const dpmParityMetrics = (reference, actual) => {
  sameLength(reference, actual, 'parity');
  let maxAbs = 0;
  let sumSquared = 0;
  for (let index = 0; index < reference.length; index++) {
    const expected = Number(reference[index]);
    const observed = Number(actual[index]);
    requireFinite(expected, `reference[${index}]`);
    requireFinite(observed, `actual[${index}]`);
    const delta = observed - expected;
    maxAbs = Math.max(maxAbs, Math.abs(delta));
    sumSquared += delta * delta;
  }
  return { maxAbs, rmse: Math.sqrt(sumSquared / reference.length) };
};
