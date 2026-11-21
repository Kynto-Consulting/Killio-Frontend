/**
 * Quick filters (chips) that compose into ONE KQL expression string. The expression is the single source of truth;
 * `parseQuickFromExpression` recovers the chip state when (and only when) the text is exactly what `buildExpression`
 * would have written, so hand-written KQL is never mangled.
 */

export interface QuickFilters {
  mine?: boolean;
  unassigned?: boolean;
  overdue?: boolean;
  dueThisWeek?: boolean;
  /** Checklist progress of the card: all items done / items still to do / no checklist at all. */
  checklist?: 'complete' | 'pending' | 'none' | null;
  status?: 'done' | 'open' | null;
  group?: { id: string; name: string } | null;
  tags?: string[];
  dateField?: 'due' | 'created';
  dateFrom?: string | null;
  dateTo?: string | null;
  text?: string;
  regex?: boolean;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const quote = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const unquote = (s: string) => s.replace(/\\(.)/g, '$1');
const cleanGroupName = (s: string) => s.replace(/[\]\r\n]/g, ' ').trim();

export function buildTerms(q: QuickFilters): string[] {
  const out: string[] = [];
  if (q.mine) out.push('assignee = me');
  if (q.unassigned) out.push('unassigned');
  if (q.status === 'done') out.push('done');
  if (q.status === 'open') out.push('open');
  if (q.overdue) out.push('overdue');
  if (q.dueThisWeek) out.push('due in this week');
  if (q.checklist === 'complete') out.push('checklist_progress = 100');
  if (q.checklist === 'pending') out.push('checklist_progress < 100');
  if (q.checklist === 'none') out.push('checklist_total = 0');
  if (q.group?.id) out.push(`group = @[group:${q.group.id.replace(/[:\]]/g, '')}:${cleanGroupName(q.group.name)}]`);
  if (q.tags && q.tags.length) out.push(`tag in (${q.tags.map(quote).join(', ')})`);
  const field = q.dateField === 'created' ? 'created' : 'due';
  const from = q.dateFrom && DATE.test(q.dateFrom) ? q.dateFrom : null;
  const to = q.dateTo && DATE.test(q.dateTo) ? q.dateTo : null;
  if (from && to) out.push(`${field} between ${from} and ${to}`);
  else if (from) out.push(`${field} >= ${from}`);
  else if (to) out.push(`${field} <= ${to}`);
  const text = (q.text ?? '').trim();
  if (text) out.push(q.regex ? `title ~ /${text.replace(/\//g, '\\/')}/` : `title contains ${quote(text)}`);
  return out;
}

export function buildExpression(q: QuickFilters): string {
  return buildTerms(q).join(' and ');
}

const TERM_PATTERNS: Array<{ re: RegExp; apply: (m: RegExpExecArray, q: QuickFilters) => boolean }> = [
  { re: /assignee = me/y, apply: (_m, q) => !q.mine && !!(q.mine = true) },
  { re: /unassigned/y, apply: (_m, q) => !q.unassigned && !!(q.unassigned = true) },
  { re: /done/y, apply: (_m, q) => !q.status && !!(q.status = 'done') },
  { re: /open/y, apply: (_m, q) => !q.status && !!(q.status = 'open') },
  { re: /overdue/y, apply: (_m, q) => !q.overdue && !!(q.overdue = true) },
  { re: /due in this week/y, apply: (_m, q) => !q.dueThisWeek && !!(q.dueThisWeek = true) },
  { re: /checklist_progress = 100/y, apply: (_m, q) => !q.checklist && !!(q.checklist = 'complete') },
  { re: /checklist_progress < 100/y, apply: (_m, q) => !q.checklist && !!(q.checklist = 'pending') },
  { re: /checklist_total = 0/y, apply: (_m, q) => !q.checklist && !!(q.checklist = 'none') },
  { re: /group = @\[group:([^:\]]+):([^\]]*)\]/y, apply: (m, q) => !q.group && !!(q.group = { id: m[1], name: m[2] }) },
  {
    re: /tag in \(((?:"(?:[^"\\]|\\.)*"(?:, )?)+)\)/y,
    apply: (m, q) => {
      if (q.tags) return false;
      const names = [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => unquote(x[1]));
      if (!names.length) return false;
      q.tags = names;
      return true;
    },
  },
  {
    re: /(due|created) between (\d{4}-\d{2}-\d{2}) and (\d{4}-\d{2}-\d{2})/y,
    apply: (m, q) => {
      if (q.dateField) return false;
      q.dateField = m[1] as 'due' | 'created';
      q.dateFrom = m[2];
      q.dateTo = m[3];
      return true;
    },
  },
  {
    re: /(due|created) (>=|<=) (\d{4}-\d{2}-\d{2})/y,
    apply: (m, q) => {
      if (q.dateField && q.dateField !== m[1]) return false;
      q.dateField = m[1] as 'due' | 'created';
      if (m[2] === '>=') { if (q.dateFrom) return false; q.dateFrom = m[3]; }
      else { if (q.dateTo) return false; q.dateTo = m[3]; }
      return true;
    },
  },
  {
    re: /title contains "((?:[^"\\]|\\.)*)"/y,
    apply: (m, q) => {
      if (q.text !== undefined) return false;
      q.text = unquote(m[1]);
      q.regex = false;
      return !!q.text.trim();
    },
  },
  {
    re: /title ~ \/((?:[^/\\]|\\.)+)\//y,
    apply: (m, q) => {
      if (q.text !== undefined) return false;
      q.text = m[1].replace(/\\\//g, '/');
      q.regex = true;
      return !!q.text.trim();
    },
  },
];

/**
 * The chip state of an expression, or `null` when the text is not exactly a composition of quick filters
 * (custom KQL, other ordering, other spacing). An empty expression is the empty quick state.
 */
export function parseQuickFromExpression(expression: string): QuickFilters | null {
  const source = expression.trim();
  if (!source) return {};
  const q: QuickFilters = {};
  let pos = 0;
  while (pos < source.length) {
    let matched = false;
    for (const { re, apply } of TERM_PATTERNS) {
      re.lastIndex = pos;
      const m = re.exec(source);
      if (!m) continue;
      const end = pos + m[0].length;
      if (end < source.length && !source.startsWith(' and ', end)) continue;
      if (!apply(m, q)) continue;
      pos = end < source.length ? end + 5 : end;
      matched = true;
      break;
    }
    if (!matched) return null;
  }
  // Lossless only if rebuilding gives back the very same text (order matters).
  return buildExpression(q) === source ? q : null;
}

/** `expr` AND `term`, keeping precedence when `expr` has a top-level `or`. */
export function appendCondition(expression: string, term: string): string {
  const base = expression.trim();
  if (!base) return term;
  const needsParens = /\bor\b|\bo\b/i.test(base) && !/^\(.*\)$/.test(base);
  return `${needsParens ? `(${base})` : base} and ${term}`;
}

export function hasQuickFilters(q: QuickFilters): boolean {
  return buildTerms(q).length > 0;
}
