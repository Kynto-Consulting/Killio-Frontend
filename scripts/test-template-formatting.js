const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

function readJson(relativePath) {
  const filePath = path.join(process.cwd(), relativePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function extractTokens(template) {
  if (typeof template !== 'string') return [];
  const matches = template.match(/\{[a-zA-Z0-9_]+\}/g);
  return matches ?? [];
}

function formatTemplate(template, values) {
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (_all, key) => {
    const value = values[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function validatePlaceholderExamples(localeData, localeName) {
  const placeholders = localeData?.canvas?.placeholders;
  assert.ok(placeholders && typeof placeholders === 'object', `${localeName}: canvas.placeholders missing`);

  for (const [placeholderKey, placeholderValue] of Object.entries(placeholders)) {
    if (typeof placeholderValue !== 'string') continue;

    const openBraces = (placeholderValue.match(/\{/g) ?? []).length;
    const closeBraces = (placeholderValue.match(/\}/g) ?? []).length;
    assert.equal(
      openBraces,
      closeBraces,
      `${localeName}: unbalanced braces in canvas.placeholders.${placeholderKey}`,
    );

    // In script template examples we use single-brace tokens like {todoText}.
    assert.equal(
      /\{\{[^}]+\}\}/.test(placeholderValue),
      false,
      `${localeName}: avoid double-brace token in canvas.placeholders.${placeholderKey}`,
    );
  }
}

function run() {
  const en = readJson('src/i18n/locales/en/integrations.json');
  const es = readJson('src/i18n/locales/es/integrations.json');

  validatePlaceholderExamples(en, 'en');
  validatePlaceholderExamples(es, 'es');

  const sample = 'TODO {todoText} in {filePath} ({lineNumber})';
  const sampleResult = formatTemplate(sample, {
    todoText: 'Fix parser',
    filePath: 'src/parser.ts',
    lineNumber: 42,
  });

  assert.equal(
    sampleResult,
    'TODO Fix parser in src/parser.ts (42)',
    'sample template formatting failed',
  );

  const tokens = extractTokens(sample);
  assert.deepEqual(tokens, ['{todoText}', '{filePath}', '{lineNumber}']);

  console.log('Template formatting smoke test passed.');
}

run();
