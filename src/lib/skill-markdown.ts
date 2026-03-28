export function buildKillioSkillMarkdown(): string {
  return `---
name: killio-cli-operator
description: Use this skill when operating Killio from CLI, including auth, teams, boards, cards, documents, tags, notifications, activity, uploads, AI, and realtime Ably auth.
---

# Killio CLI Operator Skill

## Install in your repo

\`\`\`bash
npx killio-cli@0.1.0 skill install
\`\`\`

## Optional custom destination

\`\`\`bash
npx killio-cli@0.1.0 skill install --target .github/skills/killio-cli-operator/SKILL.md --force
\`\`\`

## Configure API and login

\`\`\`bash
killio config set apiUrl http://localhost:4000
killio auth login --identifier user@example.com --password SECRET
\`\`\`

## Safe destructive operations

For delete operations on boards/documents, CLI requires a 2-step confirmation:

1. Type exact: teamworkspacename/{board-or-document-name}
2. Confirm with y/N

## Backend status

DELETE /documents/:id is available.
`;
}
