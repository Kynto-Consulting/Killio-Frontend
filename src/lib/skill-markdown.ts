export function buildKillioSkillMarkdown(): string {
  return `---
name: killio-cli-operator
description: "Use when operating Killio through CLI for humans or agents across all exposed backend domains: auth, teams, boards (kanban + mesh), cards, rooms (chat), mesh bricks/connections, Killio OS console (VM), documents, tags, notifications, activity, uploads/media, AI and Ably realtime auth. Trigger phrases: killio cli, card timer, card assign, reorder bricks, team invites, upload image, ably auth, ai generate, agent mode, chat room, mesh board, console exec, killio os."
---

# Killio CLI Operator

## Purpose

Operate Killio from terminal in two modes:

1. User mode: readable output and direct command execution.
2. Agent mode: deterministic JSON output for automation pipelines.

## Base Setup

\`\`\`bash
npx killio-cli@latest skill install
killio config set apiUrl https://backend.killio.dev
killio auth login --email user@example.com --password SECRET
killio auth whoami --json
\`\`\`

Global flags:

- \`--json\`: salida machine-readable.
- \`--debug-level <0|1|2|3>\`:
  - \`0\`: silencioso
  - \`1\`: errores
  - \`2\`: trazas API (metodo/path/status)
  - \`3\`: verbose (incluye payload/stack)

## Current Implemented Scope

### Config

- \`killio config path\`
- \`killio config list\`
- \`killio config get <key>\`
- \`killio config set <key> <value>\`

Default \`apiUrl\`: \`https://backend.killio.dev\`

### Skill

- \`killio skill install [--from-url <url>] [--target <path>] [--force]\`

### Auth

- \`killio auth register --name <name> --email <email> --password <password>\`
- \`killio auth login --email <email> --password <password>\`
- \`killio auth whoami\`
- \`killio auth refresh [--refresh-token <refreshToken>]\`
- \`killio auth logout\`

### Board

\`board create\` soporta \`--board-type kanban|mesh\` para crear tableros Kanban o Mesh.

- \`killio board create --team-id <teamId> --name <name> [--slug] [--description] [--board-type kanban|mesh] [--cover-image-url] [--background-kind none|preset|image|color|gradient] [--background-value] [--background-image-url] [--background-gradient] [--theme-kind preset|custom] [--theme-preset] [--theme-custom <json>]\`
- \`killio board get <boardId>\`
- \`killio board delete <boardId> [--force]\`
- \`killio board set-visibility <boardId> --visibility <private|team|public_link>\`
- \`killio board list-team <teamId> [--ids-only]\`
- \`killio board member list|add|remove <boardId> ...\`
- \`killio board list create|update <boardId> ...\`
- \`killio board comment <boardId> --text <text>\`
- \`killio board appearance get|set <boardId> ...\`

### Teams

- \`killio team list|create\`
- \`killio team member list|update-role|remove <teamId> ...\`
- \`killio team invite list|create|revoke <teamId> ...\`
- \`killio team invite accept --token <token>\`
- \`killio team activity <teamId>\`
- \`killio team board list|create <teamId> ...\`

### Cards

- \`killio card create --list-id <listId> --title <title> [--tags <tagIdsCsv>]\` (Nota: \`--tags\` recibe UUIDs, no nombres)
- \`killio card update|delete|get|context\`
- \`killio card timer current|list\`
- \`killio card comment add <cardId> --text <text>\`
- \`killio card tag add|remove <cardId> <tagId>\`
- \`killio card assignee add|remove <cardId> <assigneeId>\`
- \`killio card brick add|update|delete|reorder <cardId> ...\`

### Rooms (Chat)

Cada room es un canal de chat (channel, dm o thread) dentro de un team.
La VM del room (Killio OS kernel) es persistente por \`roomId\`.

**Team-level:**
- \`killio room list <teamId>\`
- \`killio room create <teamId> --name <name> --type channel|dm|thread [--description] [--emoji] [--group-id] [--linked-entity-type] [--linked-entity-id]\`
- \`killio room find <teamId> --entity-type <type> --entity-id <id>\`
- \`killio room dm <teamId> --user-id <userId>\`
- \`killio room get <roomId>\`

**Room groups:**
- \`killio room group list <teamId>\`
- \`killio room group create <teamId> --name <name> [--emoji] [--sort-order]\`
- \`killio room group delete <teamId> <groupId>\`

**Messages:**
- \`killio room message list <roomId> [--limit 50] [--before <messageId>]\`
- \`killio room message send <roomId> --content <content>\`
- \`killio room message send-ai <roomId> --content <content>\`
- \`killio room message react <roomId> <messageId> --emoji <emoji> [--remove]\`
- \`killio room message read <roomId> --message-ids <id1,id2> | --all\`
- \`killio room message info <roomId> <messageId>\`

**Members:**
- \`killio room member list <roomId>\`
- \`killio room member add <roomId> --user-id <userId> [--role admin|member|readonly]\`
- \`killio room member update-role <roomId> <userId> --role <role>\`
- \`killio room member remove <roomId> <userId>\`
- \`killio room member permissions <roomId>\`

**Preferences y settings:**
- \`killio room notification-pref get|set <roomId> [--pref all|mentions|none]\`
- \`killio room settings <roomId> --show-read-receipts true|false\`

**Calls:**
- \`killio room call list|active|create <roomId>\`
- \`killio room call end <roomId> <callId>\`
- \`killio room call transcript get <roomId> <callId>\`
- \`killio room call transcript to-document <roomId> <callId> --team-id <teamId>\`

### Mesh Boards

Los mesh boards son tableros de canvas infinito con estado SSOT versionado.
Toda mutacion sigue: GET snapshot → modifica localmente → PATCH con \`expectedRevision\`.
Flag \`--dry-run\` disponible en todos los subcomandos mutantes.

**Brick kinds:** \`board_empty | text | frame | script | mirror | portal | decision | draw | geometry\`

**Read:**
- \`killio mesh get <meshId>\` — snapshot completo \`{meshId, revision, state}\`
- \`killio mesh get-public <meshId>\` — sin auth
- \`killio mesh state <meshId>\` — solo el state
- \`killio mesh validate <meshId>\` — valida estructura sin enviar

**Viewport:**
- \`killio mesh viewport get <meshId>\`
- \`killio mesh viewport set <meshId> --x <x> --y <y> --zoom <zoom>\`

**Bricks:**
- \`killio mesh brick list <meshId> [--kind <kind>] [--parent-id <id>|root]\`
- \`killio mesh brick get <meshId> <brickId>\`
- \`killio mesh brick add <meshId> --kind <kind> --x <x> --y <y> --w <w> --h <h> [--parent-id] [--rotation] [--metadata <json>] [--content <json>] [--id <id>]\`
- \`killio mesh brick remove <meshId> <brickId>\` — elimina descendientes y conexiones
- \`killio mesh brick move <meshId> <brickId> --x <x> --y <y>\`
- \`killio mesh brick resize <meshId> <brickId> --w <w> --h <h>\`
- \`killio mesh brick rotate <meshId> <brickId> --rotation <degrees>\`
- \`killio mesh brick update <meshId> <brickId> --metadata <json> | --content <json> [--merge]\`
- \`killio mesh brick reparent <meshId> <brickId> [--parent-id <id>]\` — omite \`--parent-id\` para mover a root
- \`killio mesh brick reorder <meshId> --order '["id1","id2"]'\` — reordena rootOrder
- \`killio mesh brick transform <meshId> <brickId> [--x] [--y] [--w] [--h] [--rotation]\` — move+resize en una op

**Connections:**
- \`killio mesh connection list <meshId> [--brick-id <id>]\`
- \`killio mesh connection get <meshId> <connectionId>\`
- \`killio mesh connection add <meshId> --source <brickId> --target <brickId> [--label <text>] [--id <id>]\`
- \`killio mesh connection remove <meshId> <connectionId>\`
- \`killio mesh connection label <meshId> <connectionId> --text <text>\`
- \`killio mesh connection clear-between <meshId> --source <brickId> --target <brickId>\`

**Bulk / avanzado:**
- \`killio mesh apply <meshId> --state <json> | --state-file <path> [--expected-revision <n>]\`
- \`killio mesh clear <meshId>\` — borra todos los bricks y conexiones

**Board-level:**
- \`killio mesh set-visibility <meshId> --visibility private|team|public_link\`
- \`killio mesh normalize <meshId>\` — reset a estado vacio si corrupto
- \`killio mesh iink <meshId> --width <w> --height <h> --strokes <json> [--content-type Text|Diagram]\`

**MeshState schema:**
\`\`\`json
{
  "version": "1.0.0",
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "rootOrder": ["brickId1"],
  "bricksById": {
    "brickId1": {
      "id": "brickId1",
      "kind": "text",
      "parentId": null,
      "position": { "x": 100, "y": 200 },
      "size": { "w": 300, "h": 150 },
      "rotation": 0,
      "metadata": {},
      "content": {}
    }
  },
  "connectionsById": {
    "connId1": {
      "id": "connId1",
      "cons": ["brickId1", "brickId2"],
      "label": { "type": "doc" }
    }
  }
}
\`\`\`

### Console (Killio OS)

Cada room tiene una VM (KillioKernel) persistente en el backend.
Requiere permiso \`canPost\` en el room (admin o member).
El estado del kernel (cwd, env vars) persiste entre comandos del mismo room.

- \`killio console exec --room-id <roomId> --team-id <teamId> --command <command>\`
- \`killio console shell --room-id <roomId> --team-id <teamId>\` — REPL interactivo con prompt \`cwd $\`
- \`killio console run-script --room-id <roomId> --team-id <teamId> --commands "cmd1;cmd2;cmd3"\`
- \`killio console run-script ... [--stop-on-error]\` — detiene en primer fallo (exitCode != 0)

Pipe desde archivo:
\`\`\`bash
cat deploy.sh | killio console run-script --room-id <id> --team-id <id>
\`\`\`

### Health

- \`killio health\`

### Tags

- \`killio tag list --scope-type <global|team|board|list> --scope-id <scopeId>\`
- \`killio tag create --scope-type ... --scope-id ... --name <name> [--slug] [--color] [--tag-kind]\`

### Notifications

- \`killio notification list|unread-count|read|read-all\`
- \`killio notification run-reminders --secret <secret>\`

### Activity

- \`killio activity team|board|list|card <scopeId>\`

### Upload / Media

- \`killio upload file <filePath> [--mime-type <mimeType>]\`
- \`killio upload image <filePath> [--mime-type <mimeType>]\`
- \`killio upload get-image <objectKey> --out <path>\`

### AI

- \`killio ai extract --file <filePath> [--source-kind <sourceKind>]\`
- \`killio ai chat --scope <scope> --scope-id <scopeId> --message <message>\`
- \`killio ai generate-cards|generate-documents|generate-boards ...\`
- \`killio ai generate-report ...\`
- \`killio ai improve-card ...\`
- \`killio ai team-metrics <teamId> --current-metrics <currentMetrics>\`

### Ably

- \`killio ably auth\`

### Documents

- \`killio document list --team-id <teamId>\`
- \`killio document create --team-id <teamId> --title <title>\`
- \`killio document get <documentId>\`
- \`killio document update-title <documentId> --title <title>\`
- \`killio document delete <documentId> [--force]\`
- \`killio document export <documentId> --format <pdf|docx> [--style <carta|harvard>] [--paper-size <letter|A4>] [--out <path>]\`
- \`killio document brick add <documentId> --kind <kind> --position <n> (--content <json> | --content-file <path>)\`
- \`killio document brick update <documentId> <brickId> (--content <json> | --content-file <path>)\`
- \`killio document brick delete <documentId> <brickId>\`
- \`killio document brick reorder <documentId> (--updates <json> | --updates-file <path>)\`
- \`killio document comment list <documentId>\`
- \`killio document comment add <documentId> --text <text>\`
- \`killio document member add <documentId> --email <email> --role <owner|editor|commenter|viewer>\`

## Referencias Semanticas en IA (\`@\`, \`#\`, \`$\`)

- \`@[tipo:id:nombre]\`: menciona entidades (\`doc\`, \`board\`, \`card\`, \`user\`, \`room\`).
- \`#[cardId:brickId:selector[:arg]]\`: referencia contenido de bricks en cards.
- \`$[docId:brickId:selector[:arg]]\`: referencia contenido de documentos.
- \`@[transcript:roomId:callId]\`: referencia transcripcion de llamada en room.

Selectores comunes:

- Texto/AI/Acordeon: \`line:1-3\`, \`chars:0-120\`, \`body\`, \`title\`, \`prompt\`, \`response\`.
- Checklist: \`item:1\`, \`items:1-3\`, \`checked\`, \`unchecked\`.
- Tabla: \`cell:B2\`, \`row:2\`, \`col:C\`, \`range:A1:B3\`, \`csv\`.
- Media/Image/File: \`url\`, \`title\`, \`caption\`, \`mime\`, \`size\`, \`asset\`.

## Bricks y Estructuras JSON (Cards/Documents)

- \`text\`: \`{ "displayStyle": "paragraph|checklist|quote|code|callout", "markdown": "...", "tasks": [] }\`
- \`media\`: \`{ "mediaType": "image|file", "title": "...", "url": "...", "mimeType": "...", "sizeBytes": 0, "caption": "...", "assetId": "..." }\`
- \`ai\`: \`{ "status": "idle|running|done|error", "title": "...", "prompt": "...", "response": "...", "model": "...", "confidence": 0.0 }\`

## User Mode Patterns

\`\`\`bash
# chat rooms
killio room list team_123
killio room create team_123 --name "dev" --type channel
killio room message send <roomId> --content "deploy listo"
killio room call create <roomId>

# mesh board
killio board create --team-id team_123 --name "Architecture" --board-type mesh
killio mesh brick add <meshId> --kind text --x 100 --y 100 --w 300 --h 150
killio mesh connection add <meshId> --source <brickId1> --target <brickId2> --label "depends on"
killio mesh brick move <meshId> <brickId> --x 400 --y 200

# consola VM
killio console shell --room-id <roomId> --team-id <teamId>
killio console exec --room-id <roomId> --team-id <teamId> --command "ls -la"
\`\`\`

## Agent Mode Patterns

\`\`\`bash
killio --json room message list <roomId> --limit 20
killio --json mesh get <meshId>
killio --json mesh brick list <meshId> --kind text
killio --json console exec --room-id <roomId> --team-id <teamId> --command "cat package.json"
killio --json --debug-level 2 ai chat --scope board --scope-id board_123 --message "analiza #[card_1:brick_2:line:1-3]"
\`\`\`

Mesh mutation workflow para agentes:

1. \`killio --json mesh get <meshId>\` — captura \`revision\`.
2. Calcula nuevo estado.
3. \`killio --json mesh brick add|move|remove ... --dry-run\` — verifica.
4. Ejecuta sin \`--dry-run\`.
5. Verifica \`revision\` incrementado en respuesta.

## Safety Rules

1. Nunca asumir IDs; hacer fetch primero.
2. En mutaciones de mesh, verificar \`revision\` en respuesta — 409 significa conflicto de concurrencia, re-fetch y reintentar.
3. Preferir \`--content-file\` / \`--state-file\` para payloads grandes.
4. Manejar fallos de auth con re-login.
5. Delete en board/document requiere confirmar \`teamworkspace/nombre\` (o \`--force\`).
6. Comandos de consola ejecutan codigo real en la VM — verificar \`exitCode\` en la respuesta.

## Remaining Contractual Gaps

1. Card comments: backend no expone \`GET /cards/:cardId/comments\` ni delete.
2. Board comments: backend no expone list/delete.

## Gap Policy

Only implement commands for endpoints already exposed by backend.
Missing capabilities must be documented as contractual TODO, not mocked in CLI.
`;
}
