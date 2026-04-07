const fs = require('fs');
['list-column.web.tsx', 'list-column.mobile.tsx'].forEach(file => {
  let p = 'src/components/ui/' + file;
  let code = fs.readFileSync(p, 'utf8');

  // container style
  code = code.replace(/backgroundColor:\s*"var\(--board-panel,\s*rgba\(255,255,255,0\.6\)\)",\s*borderColor:\s*"var\(--board-border,\s*rgba\(148,163,184,0\.35\)\)",/, '');
  code = code.replace(/backgroundColor:\s*"var\(--board-panel,\s*rgba\(255,255,255,0\.6\)\)",/, 'backgroundColor: "transparent",');
  
  // Tailwind class wrapper
  code = code.replace(
    /className="w-72 shrink-0 flex flex-col rounded-xl border backdrop-blur-sm max-h-full transition-all"/g, 
    'className="w-[280px] shrink-0 flex flex-col rounded-xl bg-[#f1f2f4] dark:bg-[#101204] text-foreground max-h-full transition-all border-none shadow-sm"'
  );

  // Header border
  code = code.replace(
    /className="p-3 flex items-center justify-between group border-b border-border\/40"/g, 
    'className="px-3 py-2 flex items-center justify-between group"'
  );
  
  // list wrapper p-2 space-y-2 -> px-2 pb-2
  code = code.replace(
    /className="flex-1 overflow-y-auto p-2 space-y-2"/g,
    'className="flex-1 overflow-y-auto px-2 pb-2 flex flex-col gap-2"'
  );
  // remove space-y-2 from card map wrapper
  code = code.replace(
    /className="space-y-2">/g,
    'className="flex flex-col gap-2">'
  );

  fs.writeFileSync(p, code);
  console.log('done ' + file);
});

let kc = 'src/components/ui/kanban-card.tsx';
let kcCode = fs.readFileSync(kc, 'utf8');
kcCode = kcCode.replace(
  /className=\{`group relative flex flex-col gap-3 rounded-lg border p-3 \$\{isArchived \? 'cursor-default' : 'cursor-grab active:cursor-grabbing'\} transition-colors`\}/g, 
  "className={`group relative flex flex-col gap-2 rounded-lg bg-white dark:bg-[#22272b] shadow-[0_1px_1px_#091e4240,0_0_1px_#091e424f] dark:shadow-none dark:ring-[0.5px] dark:ring-white/10 p-3 hover:ring-2 hover:ring-primary/40 ${isArchived ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} transition-colors border-none`}"
);
fs.writeFileSync(kc, kcCode);
console.log('done kanban-card.tsx');
