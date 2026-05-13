export type AiMarkupBlock = {
  tag: string;
  content: string;
  attributes?: Record<string, string>;
};

export type ParsedAiMarkup = {
  visibleText: string;
  blocks: AiMarkupBlock[];
};

const COLLAPSIBLE_AI_TAGS = [
  "pre_think",
  "plan",
  "reflection",
  "tool_plan",
  "tool_result",
  "tool_results",
  "reasoning",
  "edit",
  "asset",
  "poll",
  "batch_tool",
];

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

  // Two separate patterns to avoid backreference numbering issues:
  // Pattern A: tool_call self-closing
  // Pattern B: collapsible tags — self-closing OR paired with explicit closing tag list
  //   closing tag: </tagname> with optional trailing whitespace/backslash
  const toolCallRe = /<tool(?:_call)?\s+(?:name\s*=?\s*(["'])([^"']+)\1\s+)?input\s*=\s*(["'])([\s\S]*?)\3\s*\/?>/gi;
  const collapsibleRe = new RegExp(
    `<(${tagList})\\b([^>]*?)(?:\\s*\\/>|>([\\s\\S]*?)<\\s*\\/\\s*(?:${tagList})\\s*>\\\\?)`,
    "gi"
  );

  // Merge both into a single scan by collecting all matches with positions
  type RawMatch = { index: number; end: number; kind: "tool_call" | "tag"; raw: RegExpExecArray };
  const allMatches: RawMatch[] = [];

  let m: RegExpExecArray | null;
  toolCallRe.lastIndex = 0;
  while ((m = toolCallRe.exec(source)) !== null) {
    if (!isInsideCode(m.index)) {
      allMatches.push({ index: m.index, end: m.index + m[0].length, kind: "tool_call", raw: m });
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
      
      // Greedy match fix: If we over-captured, trim to last }
      if (rawInput.includes('}')) {
        rawInput = rawInput.substring(0, rawInput.lastIndexOf('}') + 1);
      }

      let parsedInput: any = rawInput;
      try { parsedInput = JSON.parse(rawInput); } catch (e) {}
      blocks.push({ tag: "tool_call", content: JSON.stringify({ name, input: parsedInput }) });
    } else {
      const tag = match.raw[1].toLowerCase();
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
    if (COLLAPSIBLE_AI_TAGS.includes(tag) || tag === "tool_call") return match;
    return match.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  });
}

function isCommonMarkdownHtmlTag(tag: string): boolean {
  return [
    "a", "b", "br", "code", "del", "em", "i", "kbd", "mark",
    "p", "pre", "s", "span", "strong", "sub", "sup", "u",
  ].includes(tag);
}
