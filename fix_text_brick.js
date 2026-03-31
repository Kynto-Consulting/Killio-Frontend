const fs = require('fs');
let code = fs.readFileSync('src/components/bricks/unified-text-brick.tsx', 'utf8');

const targetStr = \                  {filteredSlashCommands.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground">Sin resultados</div>
                  ) : (
                    filteredSlashCommands.map((command, index) => (
                      <button\;

// let's just do a string split/replace
const parts = code.split('filteredSlashCommands.map((command, index) => (');

if(parts.length === 2) {
  const replacement = \ilteredSlashCommands.map((command, index) => {
                      const CategoryHeader = () => {
                        if (index === 0 || command.category !== filteredSlashCommands[index - 1].category) {
                          const catLabels: Record<string, string> = {
                            basic: "Bloques básicos",
                            media: "Contenido multimedia",
                            advanced: "Avanzado",
                            inline: "Integraciones"
                          };
                          const catName = command.category ? (catLabels[command.category] || command.category) : "Otros";
                          return (
                            <div className="px-2 pt-3 pb-1 flex w-full">
                              <span className="text-xs font-semibold text-muted-foreground">{catName}</span>
                            </div>
                          );
                        }
                        return null;
                      };

                      return (
                        <React.Fragment key={command.id}>
                          <CategoryHeader />
                          <button\;
  const result = parts[0] + replacement + parts[1].replace('</button>\n                    ))\n', '</button>\n                        </React.Fragment>\n                      );\n                    })\n');
  fs.writeFileSync('src/components/bricks/unified-text-brick.tsx', result);
  console.log('success');
} else {
  console.log('not found');
}
