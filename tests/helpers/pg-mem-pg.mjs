import { newDb } from 'pg-mem';
const db = newDb({ autoCreateForeignKeyIndices: true });
const adapter = db.adapters.createPg();
export const Pool = adapter.Pool;
export const Client = adapter.Client;
export default { Pool, Client };

// pg-mem ignores `count(*) FILTER (WHERE ...)` and returns a plain count for every column, so
// assertions here are made against the rows themselves rather than the aggregates in
// /api/community. Real Postgres computes those correctly.
