export type ChildrenByContainer = Record<string, string[]>;

const DEFAULT_CONTAINER = "body";

function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function readChildrenByContainer(content: Record<string, any> | undefined | null): ChildrenByContainer {
  const raw = content?.childrenByContainer;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const normalized: ChildrenByContainer = {};
  for (const [containerId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!containerId || !Array.isArray(value)) continue;
    normalized[containerId] = uniqueIds(value.filter((entry): entry is string => typeof entry === "string"));
  }
  return normalized;
}

export function withChildrenByContainer(content: Record<string, any> | undefined | null, map: ChildrenByContainer): Record<string, any> {
  return {
    ...(content || {}),
    childrenByContainer: map,
  };
}

export function getContainerChildIds(content: Record<string, any> | undefined | null, containerId: string = DEFAULT_CONTAINER): string[] {
  const map = readChildrenByContainer(content);
  return map[containerId] || [];
}

export function setContainerChildIds(
  content: Record<string, any> | undefined | null,
  containerId: string,
  ids: string[],
): Record<string, any> {
  const map = readChildrenByContainer(content);
  map[containerId] = uniqueIds(ids);
  return withChildrenByContainer(content, map);
}

export function insertChildId(
  content: Record<string, any> | undefined | null,
  containerId: string,
  childId: string,
  index?: number,
): Record<string, any> {
  const current = getContainerChildIds(content, containerId).filter((id) => id !== childId);
  const safeIndex = typeof index === "number" ? Math.max(0, Math.min(index, current.length)) : current.length;
  current.splice(safeIndex, 0, childId);
  return setContainerChildIds(content, containerId, current);
}

export function removeChildIdFromAllContainers(content: Record<string, any> | undefined | null, childId: string): Record<string, any> {
  const map = readChildrenByContainer(content);
  const next: ChildrenByContainer = {};
  for (const [containerId, ids] of Object.entries(map)) {
    next[containerId] = ids.filter((id) => id !== childId);
  }
  return withChildrenByContainer(content, next);
}

export function findParentContainerByChildId(
  bricks: Array<{ id: string; content?: Record<string, any> }>,
  childId: string,
): { parentId: string; containerId: string } | null {
  for (const brick of bricks) {
    const map = readChildrenByContainer(brick.content);
    for (const [containerId, ids] of Object.entries(map)) {
      if (ids.includes(childId)) {
        return { parentId: brick.id, containerId };
      }
    }
  }
  return null;
}

export function getTopLevelBrickIds(bricks: Array<{ id: string; content?: Record<string, any> }>): Set<string> {
  const nestedIds = new Set<string>();
  for (const brick of bricks) {
    const map = readChildrenByContainer(brick.content);
    for (const ids of Object.values(map)) {
      for (const id of ids) nestedIds.add(id);
    }
  }

  const topLevel = new Set<string>();
  for (const brick of bricks) {
    if (!nestedIds.has(brick.id)) topLevel.add(brick.id);
  }
  return topLevel;
}

export function resolveNestedBricks(
  parentContent: Record<string, any> | undefined | null,
  containerId: string,
  allBricks: Array<{ id: string; position?: number }>,
): Array<{ id: string; position?: number }> {
  const ids = getContainerChildIds(parentContent, containerId);
  if (ids.length === 0) return [];

  const byId = new Map(allBricks.map((brick) => [brick.id, brick]));
  const ordered: Array<{ id: string; position?: number }> = [];

  for (const id of ids) {
    const brick = byId.get(id);
    if (brick) ordered.push(brick);
  }

  return ordered;
}
