export type AiMarkupBlock = {
  tag: string;
  content: string;
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
];

export function parseAiMarkup(value?: string | null): ParsedAiMarkup {
  let source = String(value || "");
  const blocks: AiMarkupBlock[] = [];
  const seenBlocks = new Set<string>();

  // 1. First, extract self-closing <tool_call /> tags
  const toolCallPattern = /<tool_call\s+name=["']([^"']+)["']\s+input=(['"])([\s\S]*?)\2\s*\/?>/gi;
  source = source.replace(toolCallPattern, (_full, name, _q, input) => {
    const normalizedName = String(name || "").trim();
    const rawInput = String(input || "").trim();
    let parsedInput = rawInput;
    try {
      parsedInput = JSON.parse(rawInput);
    } catch (e) {
      // Keep as string if invalid JSON
    }
    
    const key = `tool_call:${normalizedName}:${rawInput}`;
    
    if (normalizedName && !seenBlocks.has(key)) {
      seenBlocks.add(key);
      blocks.push({ tag: "tool_call", content: JSON.stringify({ name: normalizedName, input: parsedInput }) });
    }
    return "\n";
  });

  // 2. Then, handle collapsible pair tags
  for (const tag of COLLAPSIBLE_AI_TAGS) {
    const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
    source = source.replace(pattern, (_full, content) => {
      const normalized = String(content || "").trim();
      const key = `${tag}:${normalized}`;
      if (normalized && !seenBlocks.has(key)) {
        seenBlocks.add(key);
        blocks.push({ tag, content: normalized });
      }
      return "\n";
    });
  }

  return {
    visibleText: escapeLooseXmlTags(source).trim(),
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

function escapeLooseXmlTags(value: string): string {
  return value.replace(/<\/?([a-z][a-z0-9_-]*)(?:\s[^>]*)?>/gi, (match, tagName) => {
    const tag = String(tagName || "").toLowerCase();
    if (isCommonMarkdownHtmlTag(tag)) return match;
    // Don't escape AI tags, so they can be parsed by parseAiMarkup in subsequent turns
    if (COLLAPSIBLE_AI_TAGS.includes(tag) || tag === "tool_call") return match;
    return match.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  });
}

function isCommonMarkdownHtmlTag(tag: string): boolean {
  return [
    "a",
    "b",
    "br",
    "code",
    "del",
    "em",
    "i",
    "kbd",
    "mark",
    "p",
    "pre",
    "s",
    "span",
    "strong",
    "sub",
    "sup",
    "u",
  ].includes(tag);
}
