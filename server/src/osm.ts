// OpenStreetMap edits, from the minutely replication diffs.
//
// OSM has no event stream. What it has is a file published every minute at a
// predictable URL, holding every node, way and relation touched in that minute.
// A recent one carried 2026 nodes with coordinates — sixty times the rate of
// geo-located Wikipedia edits — and most of them are one person dragging one
// road, a hundred nodes deep. Drawing each node would be a firehose of noise.
//
// So the unit here is the changeset, not the node: one spark per edit session,
// placed at the middle of what it touched and sized by how much that was. That
// matches how the globe already reads — one spark, one act of care.

export interface OsmChangeset {
  id: number;
  user: string;
  /** create | modify | delete — whichever action touched the most nodes */
  action: string;
  lat: number;
  lon: number;
  nodes: number;
  ts: number;
}

/** Where minute N lives: 7259608 → .../007/259/608.osc.gz */
export function diffUrl(sequence: number, base = 'https://planet.openstreetmap.org/replication/minute'): string {
  const p = String(sequence).padStart(9, '0');
  return `${base}/${p.slice(0, 3)}/${p.slice(3, 6)}/${p.slice(6, 9)}.osc.gz`;
}

/** state.txt is a Java properties file, so ':' inside the timestamp is escaped. */
export function parseSequence(stateTxt: string): number | null {
  const m = stateTxt.match(/sequenceNumber\s*=\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

const NODE = /<node\b[^>]*?\bchangeset="(\d+)"[^>]*?\blat="(-?[\d.]+)"[^>]*?\blon="(-?[\d.]+)"/g;
const NODE_USER = /<node\b[^>]*?\buser="([^"]*)"/;
const SECTION = /<(create|modify|delete)>/g;

/**
 * Fold one osmChange document into a changeset per edit session.
 *
 * Attribute order is fixed by the generator (id, version, timestamp, uid, user,
 * changeset, lat, lon), but user sits before changeset, so it is read separately
 * per line rather than in one pass.
 */
export function parseOsmChange(xml: string, now = Date.now()): OsmChangeset[] {
  const byId = new Map<number, { id: number; user: string; sumLat: number; sumLon: number; nodes: number; actions: Record<string, number> }>();

  // Track which section each line falls in, so an edit can be coloured by what it did.
  let action = 'modify';
  for (const line of xml.split('\n')) {
    SECTION.lastIndex = 0;
    const sec = SECTION.exec(line);
    if (sec) action = sec[1];
    NODE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = NODE.exec(line)) !== null) {
      const id = Number(m[1]);
      const lat = Number(m[2]);
      const lon = Number(m[3]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
      let cs = byId.get(id);
      if (!cs) {
        const u = line.match(NODE_USER);
        cs = { id, user: u ? u[1] : '', sumLat: 0, sumLon: 0, nodes: 0, actions: {} };
        byId.set(id, cs);
      }
      cs.sumLat += lat;
      cs.sumLon += lon;
      cs.nodes++;
      cs.actions[action] = (cs.actions[action] ?? 0) + 1;
    }
  }

  return [...byId.values()].map(cs => ({
    id: cs.id,
    user: cs.user,
    action: Object.entries(cs.actions).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'modify',
    // The mean of the touched nodes: for a dragged road that lands on the road.
    lat: cs.sumLat / cs.nodes,
    lon: cs.sumLon / cs.nodes,
    nodes: cs.nodes,
    ts: now,
  }));
}
