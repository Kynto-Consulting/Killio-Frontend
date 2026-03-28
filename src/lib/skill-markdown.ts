export function buildKillioSkillMarkdown(): string {
  return `---
name: killio-cli-operator
description: "Use when operating Killio through CLI for humans or agents across all exposed backend domains: auth, teams, boards, cards, documents, tags, notifications, activity, uploads/media, AI and Ably realtime auth. Trigger phrases: killio cli, card timer, card assign, reorder bricks, team invites, upload image, ably auth, ai generate, agent mode."
---

# Killio CLI Operator

## Purpose

Operate Killio from terminal in two modes:

1. User mode: readable output and direct command execution.
2. Agent mode: deterministic JSON output for automation pipelines.

## Base Setup

\`\`\`bash
npx killio-cli@0.1.1 skill install
killio config set apiUrl http://localhost:4000
killio auth login --identifier user@example.com --password SECRET
killio auth whoami --json
\`\`\`

## Current Implemented Scope

### Config

- \`killio config path\`
- \`killio config list\`
- \`killio config get <key>\`
- \`killio config set <key> <value>\`

### Skill

- \`killio skill install [--from-url <url>] [--target <path>] [--force]\`

### Auth

- \`killio auth register --username <username> --email <email> --password <password> --display-name <displayName>\`
- \`killio auth login --identifier <value> --password <value>\`
- \`killio auth whoami\`
- \`killio auth refresh [--refresh-token <refreshToken>]\`
- \`killio auth logout\`

### Board

- \`killio board create --team-id <teamId> --name <name> [--slug <slug>] [--description <description>] [--cover-image-url <coverImageUrl>]\`
- \`killio board get <boardId>\`
- \`killio board delete <boardId> [--force]\`
- \`killio board set-visibility <boardId> --visibility <private|team|public_link>\`
- \`killio board list-team <teamId>\`
- \`killio board member list|add|remove <boardId> ...\`
- \`killio board list create|update <boardId> ...\`
- \`killio board comment <boardId> --text <text>\`

### Teams

- \`killio team list|create\`
- \`killio team member list|update-role|remove <teamId> ...\`
- \`killio team invite list|create|revoke <teamId> ...\`
- \`killio team invite accept --token <token>\`
- \`killio team activity <teamId>\`
- \`killio team board list|create <teamId> ...\`

### Cards

- \`killio card create --list-id <listId> --title <title> [--tags <tagIdsCsv>]\` (Nota: \`--tags\` recibe UUIDs de tags, no nombres)
- \`killio card update|delete|get|context\`
- \`killio card timer current|list\`
- \`killio card comment add <cardId> --text <text>\`
- \`killio card tag add|remove <cardId> <tagId>\`
- \`killio card assignee add|remove <cardId> <assigneeId>\`
- \`killio card brick add|update|delete|reorder <cardId> ...\`

### Health

- \`killio health\`

### Tags

- \`killio tag list --scope-type <global|team|board|list> --scope-id <scopeId>\`
- \`killio tag create --scope-type ... --scope-id ... --name <name> [--slug <slug>] [--color <color>] [--tag-kind <tagKind>]\`

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

### Documents (Wave 1)

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

## User Mode Patterns

\`\`\`bash
killio document list --team-id team_123
killio document create --team-id team_123 --title "Sprint Notes"
killio document comment add doc_123 --text "@ana revisar seccion 2"
killio document export doc_123 --format pdf --style carta --paper-size letter
\`\`\`

## Quick Ops: Members, Invites, Tags, Assignments

\`\`\`bash
# listar miembros de team
killio team member list team_123

# invitar miembro a team
killio team invite create team_123 --email ana@example.com --role member

# listar miembros de board
killio board member list board_123

# crear y listar tags
killio tag create --scope-type board --scope-id board_123 --name "urgent" --color "#ef4444"
killio tag list --scope-type board --scope-id board_123

# asignar tag y assignee en card
killio card tag add card_123 tag_456
killio card assignee add card_123 user_789
\`\`\`

## Agent Mode Patterns

Always force machine-readable output:

\`\`\`bash
killio --json document get doc_123
killio --json document brick reorder doc_123 --updates-file ./updates.json
killio --json document comment list doc_123
\`\`\`

Recommended mutation workflow for agents:

1. Read current state.
2. Validate target IDs.
3. Execute mutation.
4. Re-read to verify final state.

## JSON Payload Examples

Create brick content:

\`\`\`json
{
  "markdown": "# Title",
  "displayStyle": "paragraph"
}
\`\`\`

Reorder updates:

\`\`\`json
[
  { "id": "brick_1", "position": 0 },
  { "id": "brick_2", "position": 1 }
]
\`\`\`

## Safety Rules

1. Never assume IDs; fetch first.
2. For destructive actions, persist previous state in logs.
3. Prefer file-based JSON inputs for large payloads (\`--content-file\`, \`--updates-file\`).
4. Handle auth failures by re-running login.
5. Delete commands on board/document require typing \`teamworkspacename/{board-or-document-name}\` and confirming \`y/N\` (unless \`--force\`).

## Remaining Contractual Gaps

1. Card comments: backend no expone \`GET /cards/:cardId/comments\` ni delete de comments.
2. Board comments: backend no expone list/delete.

## Gap Policy

Only implement commands for endpoints already exposed by backend.
Missing backend capabilities must be documented as contractual TODO, not mocked in CLI.
`;
}
