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
];

function read(): Formula[] {
  if (typeof localStorage === 'undefined') return [...BUILTINS];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    write(BUILTINS);
    return [...BUILTINS];
  }
  try {
    const parsed = JSON.parse(raw) as Formula[];
    const byId = new Map(parsed.map((f) => [f.id, f]));
    for (const b of BUILTINS) if (!byId.has(b.id)) byId.set(b.id, b);
    return Array.from(byId.values());
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
