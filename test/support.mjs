// Shared by the test files that load source: one Vite server per test process,
// loading the real modules (not a build), plus the fixtures more than one file uses.

import { after } from 'node:test';
import { createServer } from 'vite';

const vite = await createServer({
  root: process.cwd(),
  configFile: false,
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
});
after(() => vite.close());

export const load = (path) => vite.ssrLoadModule(path);

const { parseScript } = await load('/src/lib/timeline.ts');
const { buildWorld, setupFromFen } = await load('/src/lib/world.ts');
const { STARTING_FEN } = await load('/src/lib/chess.ts');

export const standardSetup = setupFromFen(STARTING_FEN);
// Never memoize this: assertions depend on each build being genuinely
// independent.
export const worldWithEvents = (text) => {
  const events = parseScript(text);
  return { events, world: buildWorld(events, standardSetup) };
};
export const worldFrom = (text) => worldWithEvents(text).world;

export const rowText = (r) => [r.num, r.white?.text ?? null, r.black?.text ?? null];
