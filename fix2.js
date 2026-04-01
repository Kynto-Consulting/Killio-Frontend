const fs = require('fs');

function fixFiles(files) {
    for (const file of files) {
        let content = fs.readFileSync(file, 'utf8');
        content = content.replace(/\\`/g, '`');
        content = content.replace(/\\\$/g, '$');
        fs.writeFileSync(file, content);
    }
}
fixFiles(['src/lib/api/documents.ts', 'src/lib/api/folders.ts', 'src/app/(dashboard)/d/page.tsx']);
