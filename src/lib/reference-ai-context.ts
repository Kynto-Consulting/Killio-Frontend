import { ReferenceResolver, ResolverContext } from "@/lib/reference-resolver";

type MentionPart = {
  type: "mention";
  mentionType: "doc" | "board" | "card" | "user";
  id: string;
  name: string;
};

type DeepPart = {
  type: "deep";
  prefix: "$" | "#";
  inner: string;
};

type RichPart = string | MentionPart | DeepPart;

function clip(value: string, max = 260): string {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}...`;
}

export function buildAiMessageWithReferenceContext(message: string, context: ResolverContext): string {
  const source = String(message || "");
  if (!source.trim()) return source;

  const rich = ReferenceResolver.renderRich(source, context) as RichPart[];
  const lines: string[] = [];

  for (const part of rich) {
    if (typeof part === "string") continue;

    if (part.type === "mention") {
      lines.push(`- Mention ${part.mentionType}: ${part.name} (${part.id})`);
      continue;
    }

    const token = `${part.prefix}[${part.inner}]`;
    const resolved = ReferenceResolver.resolveValue(token, context);
    lines.push(`- Deep ${token} => ${clip(resolved)}`);
  }

  if (lines.length === 0) return source;

  const unique = Array.from(new Set(lines)).slice(0, 20);
  const appendix = [
    "",
    "[REFERENCE_CONTEXT]",
    "Referencias parseadas para contexto:",
    ...unique,
    "[/REFERENCE_CONTEXT]",
  ].join("\n");

  return `${source}${appendix}`;
}
