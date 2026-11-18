/** Members of the group who are not yet assigned, in the group's order, without duplicates. */
export function membersToAssign(group: { memberUserIds: readonly string[] }, currentAssigneeIds: readonly string[]): string[] {
  const assigned = new Set(currentAssigneeIds);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of group.memberUserIds) {
    if (assigned.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
