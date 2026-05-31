import type { Formula } from '../shared/types';

const STORAGE_KEY = 'stock-cal:formulas:v1';

const BUILTINS: Formula[] = [
  {
    id: 'builtin-avg',
    name: '當日平均價',
    expression: '(O + H + L + C) / 4',
    isBuiltin: true,
    createdAt: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'builtin-support',
    name: '支撐價',
    expression: 'C * L / AVG',
    isBuiltin: true,
    createdAt: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'builtin-resistance-1',
    name: '第一壓力價',
    expression: 'C * H / AVG',
    isBuiltin: true,
    createdAt: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'builtin-resistance-2',
    name: '第二壓力價',
    expression: 'AVG * 1.035',
    isBuiltin: true,
    createdAt: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'builtin-support-2',
    name: '第二支撐價',
    expression: 'AVG * 0.965',
    isBuiltin: true,
    createdAt: '1970-01-01T00:00:00.000Z',
  },
];

// Keys used by the 4-quadrant 壓力/支撐 card.
export const SR_BUILTIN_IDS = {
  resistance2: 'builtin-resistance-2',
  resistance1: 'builtin-resistance-1',
  support1: 'builtin-support',
  support2: 'builtin-support-2',
} as const;

function read(): Formula[] {
  if (typeof localStorage === 'undefined') return [...BUILTINS];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    write(BUILTINS);
    return [...BUILTINS];
  }
  try {
    const parsed = JSON.parse(raw) as Formula[];
    // Always overwrite builtin entries with the latest definitions so name/expression
    // updates ship to existing users; custom formulas are preserved verbatim.
    const builtinIds = new Set(BUILTINS.map((b) => b.id));
    const customs = parsed.filter((f) => !builtinIds.has(f.id) && !f.isBuiltin);
    return [...BUILTINS, ...customs];
  } catch {
    write(BUILTINS);
    return [...BUILTINS];
  }
}

function write(formulas: Formula[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(formulas));
}

export const formulaStore = {
  list(): Formula[] {
    return read();
  },

  upsert(input: { id?: string; name: string; expression: string }): Formula {
    const all = read();
    if (input.id) {
      const idx = all.findIndex((f) => f.id === input.id);
      if (idx >= 0 && !all[idx].isBuiltin) {
        all[idx] = { ...all[idx], name: input.name, expression: input.expression };
        write(all);
        return all[idx];
      }
    }
    const created: Formula = {
      id: `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: input.name,
      expression: input.expression,
      isBuiltin: false,
      createdAt: new Date().toISOString(),
    };
    all.push(created);
    write(all);
    return created;
  },

  remove(id: string): void {
    const all = read().filter((f) => !(f.id === id && !f.isBuiltin));
    write(all);
  },
};
