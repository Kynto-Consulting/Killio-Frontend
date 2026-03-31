const fs = require('fs');
let code = fs.readFileSync('src/components/bricks/slash-commands.tsx', 'utf8');

const mapping = {
  'text': 'basic',
  'heading-1': 'basic',
  'heading-2': 'basic',
  'heading-3': 'basic',
  'heading-4': 'basic',
  'bulleted-list': 'basic',
  'numbered-list': 'basic',
  'checklist': 'basic',
  'accordion': 'basic',
  'divider': 'basic',
  'quote': 'basic',
  'math': 'advanced',
  'table': 'advanced',
  'graph': 'advanced',
  'callout': 'advanced',
  'tabs': 'advanced',
  'columns': 'advanced',
  'mention-person': 'inline',
  'mention-page': 'inline'
};

for (const [id, cat] of Object.entries(mapping)) {
  code = code.replace('id: "' + id + '", label:', 'id: "' + id + '", category: "' + cat + '", label:');
}

fs.writeFileSync('src/components/bricks/slash-commands.tsx', code);
