import { immutable } from "./immutable";
import type { CompressedTrace, DecisionTraceInput, TraceCompressionMode } from "./refinementTypes";

export class DecisionTraceCompressor {
  compress(trace: DecisionTraceInput, mode: TraceCompressionMode): CompressedTrace {
    const verbose = [`Запрос: ${trace.prompt}`, `Намерение: ${trace.intent}`, `Рассмотрено кандидатов: ${trace.candidates}`,
      `Выбрано: ${trace.selected}`, `Причина: ${trace.explanation}`, `Уверенность: ${trace.confidence}`,
      `Качество: ${trace.quality}`, `Стоимость: ${trace.credits}`];
    const lines = mode === "VERBOSE" ? verbose : mode === "COMPACT" ? [`${trace.selected}: ${trace.explanation}`, `Качество ${trace.quality}, стоимость ${trace.credits}.`]
      : [`${trace.selected}; ${trace.credits} кредитов.`];
    return immutable({ mode, lines });
  }
}
