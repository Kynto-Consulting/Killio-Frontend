import { buildKillioSkillMarkdown } from "@/lib/skill-markdown";

export async function GET(): Promise<Response> {
  const markdown = buildKillioSkillMarkdown();
  return new Response(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
