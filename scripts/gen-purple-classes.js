// Generates src/lib/tenant/purple-classes.ts: every violet/purple/indigo/fuchsia utility class used in the source.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'src');
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!['node_modules', '.next'].includes(e.name)) walk(p); }
    else if (/\.(tsx|ts|css)$/.test(e.name) && !/\.test\./.test(e.name) && !p.endsWith('purple-classes.ts')) files.push(p);
  }
})(root);
const re = /((?:[a-z0-9-]+:)*)(bg|text|border|ring|from|via|to|fill|stroke|shadow|outline|decoration|accent|caret)-(violet|purple|indigo|fuchsia)-(\d{2,3})(?:\/(\d{1,3}))?/g;
const tokens = new Set();
for (const f of files) { const s = fs.readFileSync(f, 'utf8'); let m; while ((m = re.exec(s))) tokens.add(m[0]); }
const list = [...tokens].sort();
const out = `/**
 * Every violet / purple / indigo / fuchsia Tailwind utility the app uses. In tenant mode these colours follow the brand
 * (see purpleOverrideCss in theme.ts). A test fails when the source uses one that is not listed here.
 * Regenerate: node scripts/gen-purple-classes.js (lists the classes found in src/).
 */
export const PURPLE_CLASSES: string[] = [
${list.map((c) => `  ${JSON.stringify(c)},`).join('\n')}
];
`;
fs.writeFileSync(root + '/lib/tenant/purple-classes.ts', out);
console.log('classes:', list.length);
