// Points `import pg from 'pg'` at an in-memory Postgres so the auth tests can run the real
// server.js against a real database engine. Registered before server.js is imported.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'pg') return { url: new URL('./pg-mem-pg.mjs', import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
