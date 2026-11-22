// Pure helpers of the text (DSL) script editor: highlighting, autocompletion and formatting.
// No React, no DOM: tested with node:test. The compiler itself lives in the backend (/scripts-dsl/compile).

export type TokenClass = "comment" | "string" | "number" | "keyword" | "action" | "trigger" | "operator" | "punct" | "text";
export interface HighlightToken {
  text: string;
  cls: TokenClass;
}

export const KEYWORDS_EN = ["on", "if", "else", "when", "match", "case", "default", "parallel", "branch", "for each", "as", "index", "set", "unset", "do", "literal", "ignorecase"];
export const KEYWORDS_ES = ["al recibir", "cuando", "si", "si no", "sino", "verificar", "segun", "caso", "otro", "paralelo", "rama", "para cada", "como", "indice", "definir", "establecer", "borrar", "hacer", "literal", "ignorarmayusculas"];
export const ACTIONS_EN = ["reply", "send", "dm", "react", "unreact", "wait", "http", "assign_role", "remove_role", "mute", "kick"];
export const ACTIONS_ES = ["responder", "enviar", "mensajeprivado", "reaccionar", "quitarreaccion", "esperar", "http", "asignar_rol", "quitar_rol", "silenciar", "expulsar"];
export const TRIGGERS_EN = ["command", "message", "reaction", "edit", "delete", "join", "schedule", "interaction", "webhook", "manual", "commit", "whatsapp"];
export const TRIGGERS_ES = ["comando", "mensaje", "reaccion", "edicion", "borrado", "ingreso", "horario", "interaccion", "webhook", "manual", "commit", "whatsapp"];
export const OPERATORS_EN = ["is", "is not", "contains", "does not contain", "starts with", "ends with", "matches", "exists", "does not exist", "is greater than", "is at least", "is less than", "is at most"];
export const OPERATORS_ES = ["es", "no es", "contiene", "no contiene", "empieza con", "termina con", "coincide con", "existe", "no existe", "mayor que", "al menos", "menor que", "a lo sumo"];

/** Fields the triggers put in the item (from the node descriptions), offered after `if`/`when`/`set`. */
export const COMMON_FIELDS = ["text", "command", "args", "roomId", "messageId", "authorUserId", "authorName", "mentionsBot", "options", "invokedBy", "invokedByName", "emoji", "userId", "userName", "messageText", "messageAuthorUserId", "roomSendResult.sent", "roomSendResult.error"];

const norm = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const STRUCT = new Set([...KEYWORDS_EN, ...KEYWORDS_ES].flatMap((k) => k.split(" ")).map(norm));
const ACTION_SET = new Set([...ACTIONS_EN, ...ACTIONS_ES].map(norm));
const TRIGGER_SET = new Set([...TRIGGERS_EN, ...TRIGGERS_ES].map(norm));
const OPERATOR_WORDS = new Set([...OPERATORS_EN, ...OPERATORS_ES].flatMap((k) => k.split(" ")).map(norm));

/** Splits one source line into classified tokens (concatenating `text` gives the line back). */
export function highlightLine(line: string): HighlightToken[] {
  const out: HighlightToken[] = [];
  const push = (text: string, cls: TokenClass) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.cls === cls && cls !== "string") last.text += text;
    else out.push({ text, cls });
  };
  let i = 0;
  let firstWord = true;
  while (i < line.length) {
    const c = line[i];
    if (c === "#") { push(line.slice(i), "comment"); break; }
    if (c === '"') {
      let j = i + 1;
      while (j < line.length && line[j] !== '"') j += line[j] === "\\" ? 2 : 1;
      push(line.slice(i, Math.min(j + 1, line.length)), "string");
      i = j + 1;
      continue;
    }
    if (/\s/.test(c)) { let j = i; while (j < line.length && /\s/.test(line[j])) j++; push(line.slice(i, j), "text"); i = j; continue; }
    if (/[=:,[\]{}<>!]/.test(c)) { push(c, /[<>!=]/.test(c) ? "operator" : "punct"); i++; continue; }
    let j = i;
    while (j < line.length && !/[\s"#=:,[\]{}<>!]/.test(line[j])) j++;
    const w = line.slice(i, j);
    const n = norm(w);
    let cls: TokenClass = "text";
    if (/^-?\d+(\.\d+)?$/.test(w)) cls = "number";
    else if (w === "true" || w === "false" || w === "null") cls = "number";
    else if (firstWord && STRUCT.has(n)) cls = "keyword";
    else if (firstWord && ACTION_SET.has(n)) cls = "action";
    else if (!firstWord && TRIGGER_SET.has(n) && /^\s*(on|al|cuando)\b/i.test(line)) cls = "trigger";
    else if (STRUCT.has(n)) cls = "keyword";
    else if (OPERATOR_WORDS.has(n)) cls = "operator";
    push(w, cls);
    firstWord = false;
    i = j;
  }
  return out;
}

export type CompletionKind = "keyword" | "action" | "trigger" | "operator" | "field" | "node" | "snippet";
export interface Completion {
  label: string;
  insert: string;
  detail?: string;
  kind: CompletionKind;
}
export interface CompletionResult {
  from: number; // offset where the replaced word starts
  items: Completion[];
}

export interface CompletionContext {
  lang: "en" | "es";
  /** Node kinds from GET /scripts/node-definitions (for `do <kind>`). */
  nodeKinds?: string[];
}

/** Names defined in the text: `set x = ...` and `for each y as item index i`. */
export function variablesInScope(source: string): string[] {
  const found = new Set<string>();
  for (const line of source.split(/\r?\n/)) {
    const set = /^\s*(?:set|definir|establecer)\s+([^\s=]+)/i.exec(line);
    if (set) found.add(set[1]);
    const f = /^\s*(?:for each|para cada)\s+\S+(?:\s+(?:as|como)\s+([^\s:]+))?(?:\s+(?:index|indice)\s+([^\s:]+))?/i.exec(line);
    if (f) { if (f[1] && !f[1].startsWith('"')) found.add(f[1]); if (f[2]) found.add(f[2]); }
  }
  return [...found];
}

const SNIPPETS: Record<"en" | "es", Completion[]> = {
  en: [
    { label: "if … else", insert: 'if text contains "x":\n  reply "yes"\nelse:\n  reply "no"', kind: "snippet", detail: "branch" },
    { label: "for each", insert: "for each args as item:\n  reply \"{item}\"", kind: "snippet", detail: "loop" },
    { label: "on command", insert: 'on command "name":\n  reply "Hello!"', kind: "snippet", detail: "trigger" },
  ],
  es: [
    { label: "si … si no", insert: 'si text contiene "x":\n  responder "sí"\nsi no:\n  responder "no"', kind: "snippet", detail: "rama" },
    { label: "para cada", insert: "para cada args como item:\n  responder \"{item}\"", kind: "snippet", detail: "bucle" },
    { label: "al recibir comando", insert: 'al recibir comando "nombre":\n  responder "¡Hola!"', kind: "snippet", detail: "disparador" },
  ],
};

/** Suggestions at `offset` (the caret). Context-aware: statement start, after `do`, after `if <field>`, after `on`. */
export function completionsAt(source: string, offset: number, ctx: CompletionContext): CompletionResult {
  const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
  const before = source.slice(lineStart, offset);
  const word = /[^\s"#=:,[\]{}<>!]*$/.exec(before)![0];
  const from = offset - word.length;
  const head = before.slice(0, before.length - word.length);
  const trimmed = head.trim();
  const indent = head.length - head.trimStart().length;
  const lang = ctx.lang;
  const kw = lang === "es" ? KEYWORDS_ES : KEYWORDS_EN;
  const acts = lang === "es" ? ACTIONS_ES : ACTIONS_EN;
  const trigs = lang === "es" ? TRIGGERS_ES : TRIGGERS_EN;
  const ops = lang === "es" ? OPERATORS_ES : OPERATORS_EN;
  const inString = (before.match(/"/g)?.length ?? 0) % 2 === 1;
  if (inString || before.includes("#")) return { from, items: [] };

  const filter = (items: Completion[]) => {
    const p = norm(word);
    return items.filter((c) => !p || norm(c.label).startsWith(p) || norm(c.label).includes(p)).slice(0, 40);
  };
  const vars = variablesInScope(source);
  const fields = [...new Set([...vars, ...COMMON_FIELDS])];

  // statement start
  if (!trimmed) {
    if (indent === 0) {
      const onWord = lang === "es" ? "al recibir" : "on";
      return { from, items: filter([{ label: onWord, insert: onWord + " ", kind: "keyword", detail: lang === "es" ? "disparador" : "trigger" }, ...SNIPPETS[lang].filter((s) => s.detail === (lang === "es" ? "disparador" : "trigger"))]) };
    }
    return {
      from,
      items: filter([
        ...acts.map((a) => ({ label: a, insert: a + " ", kind: "action" as const })),
        ...kw.filter((k) => !["on", "al recibir", "as", "como", "index", "indice", "ignorecase", "ignorarmayusculas", "literal", "to"].includes(k)).map((k) => ({ label: k, insert: k + " ", kind: "keyword" as const })),
        ...SNIPPETS[lang].filter((s) => !s.label.startsWith("on") && !s.label.startsWith("al recibir")),
      ]),
    };
  }
  const first = norm(trimmed.split(/\s+/)[0]);
  const second = norm(trimmed.split(/\s+/).slice(0, 2).join(" "));
  if (first === "on" || first === "cuando" || second === "al recibir") {
    if (!/\s\S+\s/.test(trimmed + " ") || trimmed.split(/\s+/).length <= (second === "al recibir" ? 2 : 1)) {
      return { from, items: filter(trigs.map((t) => ({ label: t, insert: t + " ", kind: "trigger" as const }))) };
    }
    return { from, items: [] };
  }
  if (first === "do" || first === "hacer") {
    return { from, items: filter((ctx.nodeKinds ?? []).map((k) => ({ label: k, insert: k, kind: "node" as const }))) };
  }
  if (["if", "si", "when", "verificar", "match", "segun"].includes(first)) {
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) return { from, items: filter(fields.map((f) => ({ label: f, insert: f + " ", kind: "field" as const }))) };
    if (parts.length === 2 && first !== "match" && first !== "segun") return { from, items: filter(ops.map((o) => ({ label: o, insert: o + " ", kind: "operator" as const }))) };
    return { from, items: [] };
  }
  if (["set", "definir", "establecer", "unset", "borrar", "for", "para"].includes(first) && trimmed.split(/\s+/).length === 1) {
    return { from, items: filter(fields.map((f) => ({ label: f, insert: f + " ", kind: "field" as const }))) };
  }
  return { from, items: [] };
}

/** Normalises indentation to 2 spaces per level, trims trailing spaces, collapses blank runs. Never changes tokens or comments. */
export function formatSource(source: string): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n").map((l) => l.replace(/\t/g, "  ").replace(/\s+$/, ""));
  const stack: number[] = [];
  const out: string[] = [];
  let blank = 0;
  for (const raw of lines) {
    if (!raw.trim()) { blank++; continue; }
    const width = raw.length - raw.trimStart().length;
    while (stack.length && stack[stack.length - 1] > width) stack.pop();
    if (!stack.length || stack[stack.length - 1] < width) stack.push(width);
    if (blank && out.length) out.push("");
    blank = 0;
    out.push("  ".repeat(stack.length - 1) + raw.trimStart());
  }
  return out.length ? out.join("\n") + "\n" : "";
}

export interface DslDiagnosticLike {
  line: number;
  col: number;
  endCol: number;
  severity: "error" | "warning";
  code: string;
  message: string;
}

/** Groups diagnostics by 1-based line so the editor can underline them. */
export function diagnosticsByLine(diags: DslDiagnosticLike[]): Map<number, DslDiagnosticLike[]> {
  const m = new Map<number, DslDiagnosticLike[]>();
  for (const d of diags) m.set(d.line, [...(m.get(d.line) ?? []), d]);
  return m;
}

/** Line numbers (1-based) of blocks that can be folded: a line followed by more-indented lines. Returns start -> last line. */
export function foldRanges(source: string): Map<number, number> {
  const lines = source.split("\n");
  const indentOf = (l: string) => l.length - l.trimStart().length;
  const m = new Map<number, number>();
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim() || !lines[i].trimEnd().endsWith(":")) continue;
    let j = i + 1;
    let last = -1;
    while (j < lines.length && (!lines[j].trim() || indentOf(lines[j]) > indentOf(lines[i]))) { if (lines[j].trim()) last = j; j++; }
    if (last > i) m.set(i + 1, last + 1);
  }
  return m;
}
