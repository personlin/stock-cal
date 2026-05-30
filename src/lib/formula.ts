import { Parser } from 'expr-eval';
import type { DailyOHLC } from '../shared/types';

const parser = new Parser({
  operators: {
    add: true,
    subtract: true,
    multiply: true,
    divide: true,
    remainder: true,
    power: true,
    comparison: false,
    logical: false,
    conditional: false,
    in: false,
    assignment: false,
  },
});

export type EvalContext = {
  O: number;
  H: number;
  L: number;
  C: number;
  AVG: number;
};

export function toContext(ohlc: Pick<DailyOHLC, 'open' | 'high' | 'low' | 'close'>): EvalContext {
  const AVG = (ohlc.open + ohlc.high + ohlc.low + ohlc.close) / 4;
  return { O: ohlc.open, H: ohlc.high, L: ohlc.low, C: ohlc.close, AVG };
}

export function evaluateExpression(expression: string, ctx: EvalContext): number {
  return parser.parse(expression).evaluate(ctx);
}

export function validateExpression(expression: string): { ok: true } | { ok: false; error: string } {
  try {
    const parsed = parser.parse(expression);
    const sample: EvalContext = { O: 100, H: 110, L: 95, C: 105, AVG: 102.5 };
    const result = parsed.evaluate(sample);
    if (typeof result !== 'number' || !Number.isFinite(result)) {
      return { ok: false, error: '公式必須回傳有限數值' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
