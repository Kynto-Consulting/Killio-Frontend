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
];

export function parseAiMarkup(value?: string | null): ParsedAiMarkup {
  const source = String(value || "");
  const blocks: AiMarkupBlock[] = [];
  
  // Create a combined pattern for all tags we care about
  // 1. <tool_call ... />
  // 2. <tag>...</tag>
  const toolCallPart = `<tool_call\\s+name=["']([^"']+)["']\\s+input=([''])([\\s\\S]*?)\\2\\s*\\/?>`;
  const collapsiblePart = `(<(${COLLAPSIBLE_AI_TAGS.join('|')})\\b([^>]*)>([\\s\\S]*?)<\\/\\5>)`;
  const pattern = new RegExp(`${toolCallPart}|${collapsiblePart}`, "gi");

  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    // Add preceding text as a "text" block
    const precedingText = source.slice(lastIndex, match.index);
    if (precedingText && precedingText.trim()) {
      blocks.push({ tag: "text", content: precedingText.trim() });
    }

    if (match[1]) {
      // It's a tool_call
      const name = match[1].trim();
      const rawInput = match[3].trim();
      let parsedInput = rawInput;
      try {
        parsedInput = JSON.parse(rawInput);
      } catch (e) {}
      blocks.push({ tag: "tool_call", content: JSON.stringify({ name, input: parsedInput }) });
    } else if (match[4]) {
      // It's a collapsible tag
      const tag = match[5].toLowerCase();
      const rawAttrs = match[6].trim();
      const content = match[7].trim();

      const attributes: Record<string, string> = {};
      const attrPattern = /([a-z0-9_-]+)=(?:(['"])(.*?)\2|([^>\s]+))/gi;
      let attrMatch;
      while ((attrMatch = attrPattern.exec(rawAttrs)) !== null) {
        attributes[attrMatch[1].toLowerCase()] = attrMatch[3] || attrMatch[4];
      }

      blocks.push({ tag, content, attributes });
    }

    lastIndex = pattern.lastIndex;
  }

  // Add remaining text
  const remainingText = source.slice(lastIndex);
  if (remainingText && remainingText.trim()) {
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
