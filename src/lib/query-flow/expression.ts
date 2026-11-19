/**
 * Helpers of the custom column editor: the function list with arity hints and the "No syntax errors have been detected" check.
 * The check parses `cards select <expression> as "x"` with the real engine parser, so what is accepted here is what runs.
 */
import { KQL_FUNCTIONS, kqlFunctionName } from '../query/kql.ts';
import { checkScript } from './diagnose.ts';
import type { FlowFunction, FlowParam } from './types.ts';

export interface FunctionHint {
  name: string;
  min: number;
  max: number;
  /** `replace(a, b, c)`, `concat(a, ...)`. */
  signature: string;
  user: boolean;
}

const LETTERS = 'abcdefghij';

export function signatureOf(name: string, min: number, max: number): string {
  if (max === 0) return `${name}()`;
  const required = Array.from({ length: Math.min(min, 4) }, (_, i) => LETTERS[i]);
  if (max > min + 2 || max > 6) return `${name}(${[...required, '...'].join(', ')})`;
  const optional = Array.from({ length: max - min }, (_, i) => `[${LETTERS[min + i]}]`);
  return `${name}(${[...required, ...optional].join(', ')})`;
}

/** Built-in functions (alphabetical) followed by the user's own, with their arity. */
export function functionHints(userFunctions: FlowFunction[] = []): FunctionHint[] {
  const builtIn = Object.entries(KQL_FUNCTIONS)
    .map(([key, [min, max]]): FunctionHint => ({ name: kqlFunctionName(key), min, max, signature: signatureOf(kqlFunctionName(key), min, max), user: false }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const own = userFunctions
    .filter((f) => f.name.trim())
    .map((f): FunctionHint => ({ name: f.name.trim(), min: f.args.length, max: f.args.length, signature: `${f.name.trim()}(${f.args.join(', ')})`, user: true }));
  return [...own, ...builtIn];
}

/** `$name` references of the parameters. */
export const parameterNames = (params: FlowParam[] = []): string[] => params.filter((p) => p.name.trim()).map((p) => `$${p.name.trim()}`);

export interface ExpressionCheck { ok: boolean; message: string }

/** Blank -> not ok with no message; otherwise the engine's verdict. */
export function validateExpression(expression: string): ExpressionCheck {
  const text = expression.trim();
  if (!text) return { ok: false, message: '' };
  const problem = checkScript(`cards select ${text} as "x"`);
  return problem ? { ok: false, message: problem.message } : { ok: true, message: '' };
}

// ── function catalog (the engine's own documentation) ────────────────────────
import { KQL_FUNCTION_CATALOG, KQL_M_ALIASES, type KqlFunctionInfo } from '../query/kql.ts';
import { declarationLines } from './compile.ts';

export interface CatalogItem {
  name: string;
  category: string;
  signature: string;
  description: string;
  example: string;
  /** What a double click inserts (`name(`, or the Power Query name the user searched). */
  insert: string;
  /** Power Query names of the function (`Text.Upper`). */
  mNames: string[];
  user: boolean;
}
export interface CatalogGroup { category: string; items: CatalogItem[] }

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const CATEGORY_ORDER = ['Text', 'Number', 'Date & Time', 'List', 'Logical', 'Conversion', 'Aggregation', 'Row', 'Value'];
export const USER_CATEGORY = 'User functions';
export const PARAM_CATEGORY = 'Parameters';

function mNamesByFunction(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [m, k] of KQL_M_ALIASES) map.set(k, [...(map.get(k) ?? []), m]);
  return map;
}
const M_BY_FUNCTION = mNamesByFunction();

function itemOf(info: KqlFunctionInfo): CatalogItem {
  const shown = info.signature.slice(0, Math.max(0, info.signature.indexOf('(')));
  return {
    name: shown || info.name, category: info.category, signature: info.signature, description: info.description, example: info.example,
    insert: `${shown || info.name}(`, mNames: [...new Set([...(M_BY_FUNCTION.get(info.name.toLowerCase()) ?? []), ...(info.aliases ?? []).filter((a) => a.includes('.'))])], user: false,
  };
}

/**
 * The function list of the Custom Column dialog: the user's functions, the parameters (`$name`) and the engine's catalog by category.
 * The search matches names, synonyms and Power Query names; a match on a Power Query name inserts that name (`Text.Upper(`).
 */
export function catalogGroups(query: string, userFunctions: FlowFunction[] = [], params: FlowParam[] = []): CatalogGroup[] {
  const q = fold(query);
  const groups: CatalogGroup[] = [];
  const own = userFunctions.filter((f) => f.name.trim()).map((f): CatalogItem => ({
    name: f.name.trim(), category: USER_CATEGORY, signature: `${f.name.trim()}(${f.args.join(', ')})`, description: f.description || f.body, example: '', insert: `${f.name.trim()}(`, mNames: [], user: true,
  })).filter((i) => !q || fold(i.name).includes(q));
  if (own.length > 0) groups.push({ category: USER_CATEGORY, items: own });
  const names = parameterNames(params).filter((p) => !q || fold(p).includes(q));
  if (names.length > 0) groups.push({ category: PARAM_CATEGORY, items: names.map((n) => ({ name: n, category: PARAM_CATEGORY, signature: n, description: '', example: '', insert: n, mNames: [], user: true })) });
  const byCategory = new Map<string, CatalogItem[]>();
  for (const info of KQL_FUNCTION_CATALOG) {
    const item = itemOf(info);
    let insert = item.insert;
    if (q) {
      const aliasHit = (info.aliases ?? []).filter((a) => !a.includes('.')).some((a) => fold(a).includes(q));
      const mHit = item.mNames.find((m) => fold(m).includes(q));
      const direct = fold(item.name).includes(q) || fold(info.description).includes(q) || aliasHit;
      if (!direct && !mHit) continue;
      if (!direct && mHit) insert = `${mHit}(`;
    }
    byCategory.set(info.category, [...(byCategory.get(info.category) ?? []), { ...item, insert }]);
  }
  for (const category of CATEGORY_ORDER) {
    const items = byCategory.get(category);
    if (items) groups.push({ category, items: items.sort((a, b) => a.name.localeCompare(b.name)) });
  }
  return groups;
}

/** The engine's complaint about a parameter or a function as it would be written, or null when it is fine. */
export function checkDeclaration(declaration: { param?: FlowParam; fn?: FlowFunction }): string | null {
  const errors: Array<{ nodeId: string; message: string }> = [];
  const lines = declarationLines({ nodes: [], edges: [], params: declaration.param ? [declaration.param] : undefined, functions: declaration.fn ? [declaration.fn] : undefined }, errors);
  if (errors.length > 0) return errors[0].message;
  if (lines.length === 0) return null;
  const problem = checkScript(`${lines.join('\n')}\nshow cards`);
  return problem ? problem.message : null;
}
