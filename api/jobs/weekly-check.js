import { db } from 'hatchable';
export const access = 'scheduler';
export const methods = ['POST'];
export default async function (req, res) {
  const r = await db.query('SELECT source, count(*)::int AS snapshots, max(fetched_at) AS last_fetch FROM profile_snapshots GROUP BY source ORDER BY source');
  res.json({ ok: true, mode: 'verified-data-health-check', sources: r.rows, checkedAt: new Date().toISOString() });
}