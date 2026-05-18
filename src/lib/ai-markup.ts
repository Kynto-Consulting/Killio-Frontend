export type AiMarkupBlock = {
  tag: string;
  content: string;
  attributes?: Record<string, string>;
};

export type ParsedAiMarkup = {
  visibleText: string;
  blocks: AiMarkupBlock[];
};

function parseInvokeParameters(rawValue: string): unknown {
  const source = String(rawValue || "").trim();
  if (!source) return {};

  if (source.startsWith("{") || source.startsWith("[")) {
    try {
      return JSON.parse(source);
    } catch {
      return source;
    }
  }

  const tagPattern = /<([a-zA-Z_][\w-]*)>([\s\S]*?)<\/\1>/g;
  const result: Record<string, unknown> = {};
  let match: RegExpExecArray | null;
  let foundAny = false;

  while ((match = tagPattern.exec(source)) !== null) {
    foundAny = true;
    const key = match[1]!;
    const value = coerceInvokeParameterValue(match[2]!.trim());
    const existing = result[key];
    if (existing === undefined) {
      result[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      result[key] = [existing, value];
    }
  }

  return foundAny ? result : source;
}

function coerceInvokeParameterValue(rawValue: string): unknown {
  const value = String(rawValue || "").trim();
  if (!value) return "";

  if (value.startsWith("{") || value.startsWith("[")) {
    try {
      return JSON.parse(value);
    } catch {
      // fall through
    }
  }

  if (/<([a-zA-Z_][\w-]*)>([\s\S]*?)<\/\1>/.test(value)) {
    return parseInvokeParameters(value);
  }

  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === "true";
  if (/^null$/i.test(value)) return null;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

const COLLAPSIBLE_AI_TAGS = [
  "pre_think",
  "plan",
  "reflection",
  "tool_plan",
  "tool_result",
  "tool_results",
  "tool_status",
  "tool_output",
  "reasoning",
  "edit",
  "asset",
  "poll",
  "batch_tool",
  "batch_invoke",
];

const INLINE_TOOL_META_TAGS = new Set(["tool_status", "tool_output"]);

export function parseAiMarkup(value?: string | null): ParsedAiMarkup {
  const source = String(value || "");
  const blocks: AiMarkupBlock[] = [];

  // Detect code block ranges to skip XML parsing inside them
  const codeBlockRanges: Array<[number, number]> = [];
  const codeBlockRegex = /(`{1,3})[\s\S]*?\1/g;
  let cbMatch;
  while ((cbMatch = codeBlockRegex.exec(source)) !== null) {
    codeBlockRanges.push([cbMatch.index, cbMatch.index + cbMatch[0].length]);
  }
  const isInsideCode = (index: number) =>
    codeBlockRanges.some(([start, end]) => index >= start && index < end);

  const tagList = COLLAPSIBLE_AI_TAGS.join("|");

  // Pattern A: legacy tool_call self-closing — <tool_call name="x" input='...' />
  const toolCallRe = /<tool(?:_call)?\s+(?:name\s*=?\s*(["'])([^"']+)\1\s+)?input\s*=\s*(["'])([\s\S]*?)\3\s*\/?>/gi;
  // Pattern B: new Anthropic invoke format — <invoke name="x"> or <invoke id="tc-1" name="x"> (any attr order)
  const invokeRe = /<invoke\s+([^>]+?)>([\s\S]*?)<\/invoke>/gi;
  // Pattern C: collapsible tags (batch_tool, batch_invoke, pre_think, plan, etc.)
  const collapsibleRe = new RegExp(
    `<(${tagList})\\b([^>]*?)(?:\\s*\\/>|>([\\s\\S]*?)<\\s*\\/\\s*(?:${tagList})\\s*>\\\\?)`,
    "gi"
  );

  // Merge all into a single scan by collecting all matches with positions
  type RawMatch = { index: number; end: number; kind: "tool_call" | "invoke" | "tag"; raw: RegExpExecArray };
  const allMatches: RawMatch[] = [];

  let m: RegExpExecArray | null;
  toolCallRe.lastIndex = 0;
  while ((m = toolCallRe.exec(source)) !== null) {
    if (!isInsideCode(m.index)) {
      allMatches.push({ index: m.index, end: m.index + m[0].length, kind: "tool_call", raw: m });
    }
  }
  invokeRe.lastIndex = 0;
  while ((m = invokeRe.exec(source)) !== null) {
    if (!isInsideCode(m.index)) {
      allMatches.push({ index: m.index, end: m.index + m[0].length, kind: "invoke", raw: m });
    }
  }
  collapsibleRe.lastIndex = 0;
  while ((m = collapsibleRe.exec(source)) !== null) {
    if (!isInsideCode(m.index)) {
      allMatches.push({ index: m.index, end: m.index + m[0].length, kind: "tag", raw: m });
    }
  }

  // Sort by position
  allMatches.sort((a, b) => a.index - b.index);

  // Remove overlapping matches (keep first)
  const filtered: RawMatch[] = [];
  let cursor = 0;
  for (const match of allMatches) {
    if (match.index >= cursor) {
      filtered.push(match);
      cursor = match.end;
    }
  }

  let lastIndex = 0;
  for (const match of filtered) {
    const precedingText = source.slice(lastIndex, match.index);
    if (precedingText.trim()) {
      blocks.push({ tag: "text", content: precedingText.trim() });
    }

    if (match.kind === "tool_call") {
      const name = match.raw[2]?.trim() || "";
      let rawInput = match.raw[4]?.trim() || "";
      const idMatch = match.raw[0]?.match(/\bid\s*=\s*(["'])([^"']+)\1/i);
      const id = idMatch ? idMatch[2] : undefined;

      // Greedy match fix: If we over-captured, trim to last }
      if (rawInput.includes('}')) {
        rawInput = rawInput.substring(0, rawInput.lastIndexOf('}') + 1);
      }

      const parsedInput = parseInvokeParameters(rawInput);
      blocks.push({ tag: "tool_call", content: JSON.stringify({ id, name, input: parsedInput }) });
    } else if (match.kind === "invoke") {
      // <invoke name="tool_name"> or <invoke id="tc-1" name="tool_name"> — any attr order
      const attrsStr = match.raw[1] || "";
      const nameMatch = attrsStr.match(/name\s*=\s*(["'])([\w_]+)\1/);
      const idMatch = attrsStr.match(/id\s*=\s*(["'])([^"']+)\1/);
      const name = nameMatch ? nameMatch[2] : (attrsStr.trim() || "");
      const id = idMatch ? idMatch[2] : undefined;
      const innerContent = match.raw[2] || "";
      // Extract content from <parameters>...</parameters>
      const paramsMatch = innerContent.match(/<parameters\s*>([\s\S]*?)<\/parameters\s*>/i);
      let rawInput = paramsMatch ? paramsMatch[1].trim() : innerContent.trim();
      const parsedInput = parseInvokeParameters(rawInput);
      // Normalize to same "tool_call" block so the rest of the UI renders unchanged
      blocks.push({ tag: "tool_call", content: JSON.stringify({ id, name, input: parsedInput }) });
    } else {
      const tag = match.raw[1].toLowerCase();
      if (INLINE_TOOL_META_TAGS.has(tag)) {
        lastIndex = match.end;
        continue;
      }

      const rawAttrs = (match.raw[2] || "").trim();
      const content = (match.raw[3] || "").trim();

      const attributes: Record<string, string> = {};
      const attrPattern = /([a-z0-9_-]+)=(?:(["'])(.*?)\2|([^>\s]+))/gi;
      let attrMatch;
      while ((attrMatch = attrPattern.exec(rawAttrs)) !== null) {
        attributes[attrMatch[1].toLowerCase()] = attrMatch[3] ?? attrMatch[4];
      }

      blocks.push({ tag, content, attributes });
    }

    lastIndex = match.end;
  }

  const remainingText = source.slice(lastIndex);
  if (remainingText.trim()) {
    blocks.push({ tag: "text", content: remainingText.trim() });
  }

  return {
    visibleText: blocks
      .filter((b) => b.tag === "text")
      .map((b) => (typeof b.content === "string" ? b.content.trim() : ""))
      .filter(Boolean)
      .join(" "),
    blocks,
  };
}

export function getAiMarkupLabel(tag: string): string {
  const normalized = tag.toLowerCase();
  if (normalized === "pre_think") return "Pre-think";
  if (normalized === "plan") return "Plan";
  if (normalized === "tool_plan") return "Tool plan";
  if (normalized === "tool_result" || normalized === "tool_results") return "Tool result";
  if (normalized === "reasoning") return "Reasoning";
  return normalized.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export type PreThinkSection = { tag: string; content: string };

export function parsePreThinkSections(content: string): PreThinkSection[] {
  const sections: PreThinkSection[] = [];
  const pattern = /<(assumptions|risks|strategy|visual_description)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const tag = match[1].toLowerCase();
    // Skip visual_description in the frontend display
    if (tag === 'visual_description') continue;
    
    sections.push({ tag, content: match[2].trim() });
  }
  if (sections.length === 0 && content.trim()) {
    // If we only had a visual_description and nothing else, content.trim() might be truthy
    // but we don't want to show it as raw if it's just tags we chose to skip.
    // So we check if the remaining text (after removing known tags) is substantial.
    const cleanContent = content.replace(/<(assumptions|risks|strategy|visual_description)\b[^>]*>([\s\S]*?)<\/\1>/gi, '').trim();
    if (cleanContent) {
      sections.push({ tag: "raw", content: cleanContent });
    }
  }
  return sections;
}

function escapeLooseXmlTags(value: string): string {
  return value.replace(/<\/?([a-z][a-z0-9_-]*)(?:\s[^>]*)?>/gi, (match, tagName) => {
    const tag = String(tagName || "").toLowerCase();
    if (isCommonMarkdownHtmlTag(tag)) return match;
    if (COLLAPSIBLE_AI_TAGS.includes(tag) || tag === "tool_call" || tag === "invoke" || tag === "parameters" || tag === "tool_output" || tag === "tool_status") return match;
    return match.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  });
}

function isCommonMarkdownHtmlTag(tag: string): boolean {
  return [
    "a", "b", "br", "code", "del", "em", "i", "kbd", "mark",
    "p", "pre", "s", "span", "strong", "sub", "sup", "u",
  ].includes(tag);
}

/**
 * Splits text content at the start of an incomplete tool-call tag.
 * Handles both legacy `<tool_call` / `<batch_tool` and new `<invoke` / `<batch_invoke` formats.
 * During streaming, the model may emit partial opening tags before they are fully
 * closed — these fall through `parseAiMarkup` as plain text blocks.
 * Call this on any text block content to strip the partial XML and signal that a
 * "Building tool call…" placeholder should be rendered instead.
 */
export function splitAtPartialToolTag(content: string): { clean: string; hasPartial: boolean } {
  const idx = content.search(/<(?:batch_invoke|batch_tool|invoke|tool_call)\b/i);
  if (idx === -1) return { clean: content, hasPartial: false };
  return {
    clean: content.slice(0, idx).trimEnd(),
    hasPartial: true,
  };
}
