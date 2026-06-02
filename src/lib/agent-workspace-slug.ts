// 64-word base used by the AI Draft Studio to generate a per-session
// scratch folder slug — `[w1]-[w2]-[w3]-[w4]` (e.g. `amber-fox-mesa-river`).
// The same list lives in Killio-Backend/src/modules/agent/workspace-slug.ts;
// keeping them in sync is intentional — they are independent picks, the
// backend just validates the slug shape (4 lowercase ASCII words joined by
// '-') before mounting `/tmp/draft-studio/<slug>/`.
const WORDS: readonly string[] = [
  "amber", "apple", "arc", "arrow", "atlas", "aurora", "azure", "beacon",
  "blue", "bolt", "breeze", "cedar", "cobalt", "coral", "cosmo", "crystal",
  "dawn", "delta", "drift", "echo", "ember", "falcon", "feather", "flint",
  "forest", "frost", "glade", "glow", "haven", "horizon", "iron", "ivory",
  "jade", "kite", "lake", "lark", "lemon", "lotus", "lumen", "maple",
  "mesa", "meteor", "mint", "moss", "nebula", "neon", "oak", "onyx",
  "opal", "orbit", "otter", "pebble", "pine", "pulse", "quartz", "quill",
  "raven", "reef", "river", "sage", "shore", "spark", "sprout", "starling",
];

if (WORDS.length !== 64) {
  throw new Error(`Workspace slug word list must have 64 entries (got ${WORDS.length}).`);
}

/** Pick 4 random words → "amber-fox-mesa-river". */
export function generateWorkspaceSlug(): string {
  // Prefer crypto.getRandomValues over Math.random so two parallel draft
  // sessions on the same client don't collide on the same seeded sequence.
  const out: string[] = [];
  if (typeof crypto !== "undefined" && (crypto as any).getRandomValues) {
    const arr = new Uint32Array(4);
    crypto.getRandomValues(arr);
    for (let i = 0; i < 4; i++) out.push(WORDS[arr[i] % WORDS.length]);
  } else {
    for (let i = 0; i < 4; i++) out.push(WORDS[Math.floor(Math.random() * WORDS.length)]);
  }
  return out.join("-");
}
