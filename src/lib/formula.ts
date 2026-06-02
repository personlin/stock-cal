import type { DailyOHLC } from '../shared/types';

export type EvalContext = {
  O: number;
  H: number;
  L: number;
  C: number;
  AVG: number;
};

type Token =
  | { type: 'number'; value: number }
  | { type: 'identifier'; value: keyof EvalContext | string }
  | { type: 'operator'; value: '+' | '-' | '*' | '/' | '%' | '^' }
  | { type: 'paren'; value: '(' | ')' }
  | { type: 'eof' };

type AstNode =
  | { type: 'number'; value: number }
  | { type: 'variable'; name: keyof EvalContext }
  | { type: 'unary'; operator: '+' | '-'; argument: AstNode }
  | { type: 'binary'; operator: '+' | '-' | '*' | '/' | '%' | '^'; left: AstNode; right: AstNode };

const VARIABLES = new Set<keyof EvalContext>(['O', 'H', 'L', 'C', 'AVG']);

export function toContext(ohlc: Pick<DailyOHLC, 'open' | 'high' | 'low' | 'close'>): EvalContext {
  const AVG = (ohlc.open + ohlc.high + ohlc.low + ohlc.close) / 4;
  return { O: ohlc.open, H: ohlc.high, L: ohlc.low, C: ohlc.close, AVG };
}

export function evaluateExpression(expression: string, ctx: EvalContext): number {
  const ast = parseExpression(expression);
  const result = evaluateAst(ast, ctx);
  if (!Number.isFinite(result)) throw new Error('公式必須回傳有限數值');
  return result;
}

export function validateExpression(expression: string): { ok: true } | { ok: false; error: string } {
  try {
    const ast = parseExpression(expression);
    const sample: EvalContext = { O: 100, H: 110, L: 95, C: 105, AVG: 102.5 };
    const result = evaluateAst(ast, sample);
    if (typeof result !== 'number' || !Number.isFinite(result)) {
      return { ok: false, error: '公式必須回傳有限數值' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function parseExpression(expression: string): AstNode {
  const parser = new FormulaParser(tokenize(expression));
  return parser.parse();
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const char = input[i];
    if (/\s/.test(char)) {
      i += 1;
      continue;
    }

    if (isDigit(char) || char === '.') {
      const start = i;
      let hasDot = false;
      while (i < input.length && (isDigit(input[i]) || input[i] === '.')) {
        if (input[i] === '.') {
          if (hasDot) throw new Error('數字格式錯誤');
          hasDot = true;
        }
        i += 1;
      }

      const raw = input.slice(start, i);
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error('數字格式錯誤');
      tokens.push({ type: 'number', value });
      continue;
    }

    if (isLetter(char)) {
      const start = i;
      while (i < input.length && isLetter(input[i])) i += 1;
      const value = input.slice(start, i).toUpperCase();
      tokens.push({ type: 'identifier', value });
      continue;
    }

    if (isOperator(char)) {
      tokens.push({ type: 'operator', value: char });
      i += 1;
      continue;
    }

    if (char === '(' || char === ')') {
      tokens.push({ type: 'paren', value: char });
      i += 1;
      continue;
    }

    throw new Error(`不支援的字元：${char}`);
  }

  tokens.push({ type: 'eof' });
  return tokens;
}

class FormulaParser {
  private position = 0;
  private readonly tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): AstNode {
    const expression = this.parseAdditive();
    if (this.current().type !== 'eof') throw new Error('公式結尾有多餘內容');
    return expression;
  }

  private parseAdditive(): AstNode {
    let node = this.parseMultiplicative();

    while (this.matchOperator('+') || this.matchOperator('-')) {
      const operator = this.previous().value;
      const right = this.parseMultiplicative();
      node = { type: 'binary', operator, left: node, right };
    }

    return node;
  }

  private parseMultiplicative(): AstNode {
    let node = this.parsePower();

    while (this.matchOperator('*') || this.matchOperator('/') || this.matchOperator('%')) {
      const operator = this.previous().value;
      const right = this.parsePower();
      node = { type: 'binary', operator, left: node, right };
    }

    return node;
  }

  private parsePower(): AstNode {
    const left = this.parseUnary();
    if (!this.matchOperator('^')) return left;
    const right = this.parsePower();
    return { type: 'binary', operator: '^', left, right };
  }

  private parseUnary(): AstNode {
    if (this.matchOperator('+') || this.matchOperator('-')) {
      const operator = this.previous().value as '+' | '-';
      return { type: 'unary', operator, argument: this.parseUnary() };
    }

    return this.parsePrimary();
  }

  private parsePrimary(): AstNode {
    const token = this.advance();

    if (token.type === 'number') return { type: 'number', value: token.value };

    if (token.type === 'identifier') {
      if (!isVariable(token.value)) throw new Error(`不支援的變數：${token.value}`);
      return { type: 'variable', name: token.value };
    }

    if (token.type === 'paren' && token.value === '(') {
      const expression = this.parseAdditive();
      if (!this.matchParen(')')) throw new Error('缺少右括號');
      return expression;
    }

    throw new Error('公式語法錯誤');
  }

  private matchOperator(operator: Extract<Token, { type: 'operator' }>['value']): boolean {
    const token = this.current();
    if (token.type !== 'operator' || token.value !== operator) return false;
    this.position += 1;
    return true;
  }

  private matchParen(paren: '(' | ')'): boolean {
    const token = this.current();
    if (token.type !== 'paren' || token.value !== paren) return false;
    this.position += 1;
    return true;
  }

  private advance(): Token {
    const token = this.current();
    if (token.type !== 'eof') this.position += 1;
    return token;
  }

  private current(): Token {
    return this.tokens[this.position];
  }

  private previous(): Token & { type: 'operator' } {
    return this.tokens[this.position - 1] as Token & { type: 'operator' };
  }
}

function evaluateAst(node: AstNode, ctx: EvalContext): number {
  switch (node.type) {
    case 'number':
      return node.value;
    case 'variable':
      return ctx[node.name];
    case 'unary': {
      const value = evaluateAst(node.argument, ctx);
      return node.operator === '-' ? -value : value;
    }
    case 'binary': {
      const left = evaluateAst(node.left, ctx);
      const right = evaluateAst(node.right, ctx);
      switch (node.operator) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          return left / right;
        case '%':
          return left % right;
        case '^':
          return left ** right;
      }
    }
  }
}

function isDigit(char: string): boolean {
  return char >= '0' && char <= '9';
}

function isLetter(char: string): boolean {
  return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z');
}

function isOperator(char: string): char is '+' | '-' | '*' | '/' | '%' | '^' {
  return char === '+' || char === '-' || char === '*' || char === '/' || char === '%' || char === '^';
}

function isVariable(value: string): value is keyof EvalContext {
  return VARIABLES.has(value as keyof EvalContext);
}
