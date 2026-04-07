const fs = require('fs');

function replaceInFile(file, componentName) {
  if (!fs.existsSync(file)) return;
  
  let content = fs.readFileSync(file, 'utf8');

  // Regex to remove the entire `function getActionTheme(action: string) { ... }` block
  const funcRegex = /function getActionTheme\(action[^\}]+return \{ icon: Layout[^\}]+badgeClass: [^\}]+\} \};\n\}/;
  content = content.replace(funcRegex, '');
  
  // also match any remaining `function getActionTheme(action: string) {` properly
  content = content.replace(/function getActionTheme\(action:\s*string\)\s*\{[\s\S]*?return\s*\{\s*icon:\s*[A-Z][a-z]+[^\}]+\};\s*\n\}/g, '');

  if (!content.includes('use-action-theme')) {
      content = content.replace('"use client";', '"use client";\nimport { useActionTheme } from "@/hooks/use-action-theme";');
  }
  
  const compRegex = new RegExp(`export function ${componentName}\\([^\\)]*\\) \\{`);
  content = content.replace(compRegex, match => `${match}\n  const getActionTheme = useActionTheme();`);
  
  fs.writeFileSync(file, content);
  console.log(`Processed ${file}`);
}

replaceInFile('src/components/ui/board-chat-drawer.mobile.tsx', 'BoardChatDrawerMobile');
replaceInFile('src/components/ui/board-chat-drawer.web.tsx', 'BoardChatDrawerWeb');
replaceInFile('src/components/ui/card-detail-modal.tsx', 'CardDetailModal');
replaceInFile('src/components/ui/document-comments-drawer.tsx', 'DocumentCommentsDrawer');
