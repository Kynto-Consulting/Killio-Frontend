import assert from "node:assert/strict";
import test from "node:test";

import { splitDocumentationBricks } from "./doc-bricks.ts";

test("empty input gives no bricks", () => {
  assert.deepEqual(splitDocumentationBricks(null), []);
  assert.deepEqual(splitDocumentationBricks("  \n "), []);
});

test("splits at level 1-2 headings and keeps the heading in its section", () => {
  const bricks = splitDocumentationBricks("Intro\n\n## Uso\npaso 1\n\n### Detalle\nmas\n\n# Fin\nx");
  assert.deepEqual(bricks.map((b) => b.text.split("\n")[0]), ["Intro", "## Uso", "# Fin"]);
  assert.ok(bricks[1].text.includes("### Detalle"));
});

test("headings inside code fences or math blocks do not split", () => {
  const bricks = splitDocumentationBricks("## A\n```\n## no\n```\n$$\n## tampoco\n$$\n## B");
  assert.equal(bricks.length, 2);
});

test("blockquote sections with a marker become callouts", () => {
  const bricks = splitDocumentationBricks("## Ojo\n\ntexto\n\n## Aviso\n> [!TIP]\n> Usa [color:red]rojo[/color]\n> y listo");
  assert.deepEqual(bricks.map((b) => b.kind), ["text", "text", "callout"]);
  assert.equal(bricks[1].text, "## Aviso");
  assert.equal(bricks[2].text, "Usa [color:red]rojo[/color]\ny listo");
});
