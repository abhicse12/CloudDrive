/**
 * Keeps docs/openapi.yaml honest: every route the server defines must be documented,
 * and the docs must not describe routes that don't exist. Reads the route files as
 * text (no server start), so it's fast and independent of the database.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const ROUTES = path.join(ROOT, 'server', 'src', 'routes');
const read = (file) => fs.readFileSync(file, 'utf8');

/** "GET /api/files/{id}" for every route in the route files. */
function serverRoutes() {
  // apiRouter.use('/files', fileRouter)  →  fileRouter is mounted at /api/files
  const mounts = Object.fromEntries(
    [...read(path.join(ROUTES, 'index.js')).matchAll(/apiRouter\.use\('([^']+)',\s*(\w+)\)/g)].map(
      ([, prefix, router]) => [router, `/api${prefix}`],
    ),
  );
  const routes = new Set();
  for (const file of fs.readdirSync(ROUTES).filter((f) => f.endsWith('.routes.js'))) {
    for (const [, router, method, route] of read(path.join(ROUTES, file)).matchAll(
      /(\w+Router)\.(get|post|patch|put|delete)\(\s*'([^']*)'/g,
    )) {
      expect(
        mounts[router],
        `${router} (in ${file}) is not mounted in routes/index.js`,
      ).toBeDefined();
      const full = `${mounts[router]}${route === '/' ? '' : route}`.replace(/:(\w+)/g, '{$1}');
      routes.add(`${method.toUpperCase()} ${full}`);
    }
  }
  return routes;
}

/** "GET /api/files/{id}" for every operation in the OpenAPI file. */
function documentedRoutes() {
  const routes = new Set();
  let current = null;
  for (const line of read(path.join(ROOT, 'docs', 'openapi.yaml')).split(/\r?\n/)) {
    const pathLine = line.match(/^ {2}(\/api\/\S*):\s*$/);
    if (pathLine) current = pathLine[1];
    else if (/^\S/.test(line)) current = null; // left the paths section
    const op = current && line.match(/^ {4}(get|post|patch|put|delete):/);
    if (op) routes.add(`${op[1].toUpperCase()} ${current}`);
  }
  return routes;
}

describe('docs/openapi.yaml', () => {
  const server = serverRoutes();
  const docs = documentedRoutes();

  it('finds a realistic number of routes on both sides', () => {
    expect(server.size).toBeGreaterThan(40);
    expect(docs.size).toBeGreaterThan(40);
  });

  it('documents every route the server has', () => {
    expect([...server].filter((route) => !docs.has(route)).sort()).toEqual([]);
  });

  it('documents nothing that does not exist', () => {
    expect([...docs].filter((route) => !server.has(route)).sort()).toEqual([]);
  });

  it('every $ref points to a component that is defined', () => {
    const yaml = read(path.join(ROOT, 'docs', 'openapi.yaml'));
    // Components are keys indented 4 spaces under "  schemas:", "  responses:", …
    const defined = new Set();
    let section = null;
    for (const line of yaml.split(/\r?\n/)) {
      const sectionLine = line.match(/^ {2}(schemas|responses|parameters|securitySchemes):\s*$/);
      if (sectionLine) section = sectionLine[1];
      else if (/^ {0,2}\S/.test(line)) section = null;
      const key = section && line.match(/^ {4}(\w+):/);
      if (key) defined.add(`#/components/${section}/${key[1]}`);
    }
    const refs = new Set([...yaml.matchAll(/\$ref: '([^']+)'/g)].map((m) => m[1]));

    expect(refs.size).toBeGreaterThan(10);
    expect([...refs].filter((ref) => !defined.has(ref))).toEqual([]);
  });
});
