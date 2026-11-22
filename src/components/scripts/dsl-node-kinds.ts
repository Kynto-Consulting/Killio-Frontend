const BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL
  ?? process.env.NEXT_PUBLIC_KILLIO_API_URL
  ?? process.env.NEXT_PUBLIC_API_URL
  ?? "http://localhost:4000"
).replace(/\/$/, "");

/** Node kinds for `do <kind>` completion (from the same endpoint the block palette uses). Fetched once per team. */
const cache = new Map<string, Promise<string[]>>();

export function getScriptNodeDefinitionKinds(teamId: string, accessToken: string): Promise<string[]> {
  let p = cache.get(teamId);
  if (!p) {
    p = fetch(`${BASE_URL}/scripts/node-definitions?teamId=${encodeURIComponent(teamId)}`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((j) => {
        const list = Array.isArray(j) ? j : Array.isArray(j?.definitions) ? j.definitions : Array.isArray(j?.nodes) ? j.nodes : Object.values(j ?? {});
        return list.map((d: any) => (typeof d === "string" ? d : d?.kind)).filter((k: unknown): k is string => typeof k === "string" && !k.includes("trigger")).sort();
      })
      .catch(() => []);
    cache.set(teamId, p);
  }
  return p;
}
