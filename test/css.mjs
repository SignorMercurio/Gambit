// Readers for `src/styles.css` as source text, shared by the tests that guard
// layout rules.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

// Every reader works on comment-stripped text: comments name the properties
// being read, so a bare regex would match prose, and a stray brace in prose
// would break `[^}]*` rule scans.
export const bareStyles = styles.replace(/\/\*[\s\S]*?\*\//g, '');

// Every rule for a selector, across all tiers. Escapes the selector itself so
// callers write plain CSS (an unescaped `.` matches anything and fails
// silently), and `\s*` keeps a `.subtitle-strip{` tier in the set.
export const cssRules = (selector, source = bareStyles) =>
  source.match(
    new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*\\}`, 'g'),
  ) ?? [];

// The one rule for a top-level selector, read through `cssRules` so both see
// comment-stripped source. The `\n` prefix keeps `cssRule('.marker')` from
// matching `.timeline .marker`; `anchor` picks between same-selector tiers.
export const cssRule = (selector, anchor = '') => {
  const rule = cssRules(`\n${selector}`).find((r) => r.includes(anchor));
  assert.ok(rule, `${selector} exists`);
  return rule;
};

export const cssNum = (source, prop) => {
  const m = source.match(new RegExp(`(?:^|[;{\\s])${prop}:\\s*(-?[\\d.]+)`));
  assert.ok(m, `${prop} is declared as a number so the geometry stays derivable`);
  return Number(m[1]);
};
// Asserts rather than indexing a null match, so a legal rewrite of the
// shorthand names what broke instead of throwing a TypeError.
export const cssLengths = (source, prop) => {
  const m = source.match(new RegExp(`(?:^|[;{\\s])${prop}:\\s*([^;]+)[;}]`));
  assert.ok(m, `${prop} is declared as a length shorthand`);
  return m[1].trim().split(/\s+/).map((v) => Number.parseFloat(v));
};
// Top-level `@media` blocks, brace-balanced, with the unconditioned text
// between them as `query: null` regions. Splitting on `@media` would assign
// that text to the preceding query.
export const styleRegions = (() => {
  const src = bareStyles;
  const regions = [];
  let cursor = 0;
  for (let at = src.indexOf('\n@media'); at !== -1; at = src.indexOf('\n@media', at + 1)) {
    let depth = 0;
    for (let i = at; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) {
        if (at > cursor) regions.push({ query: null, css: src.slice(cursor, at) });
        regions.push({
          query: src.slice(at, src.indexOf('{', at)).trim(),
          css: src.slice(at, i + 1),
        });
        cursor = i + 1;
        at = i;
        break;
      }
    }
  }
  if (cursor < src.length) regions.push({ query: null, css: src.slice(cursor) });
  return regions;
})();
export const mediaRegions = styleRegions.filter((r) => r.query !== null);

// Every breakpoint in the stylesheet and one pixel either side. Media queries
// are step functions, so this finite grid covers every distinct combination
// the cascade can produce.
export const axis = (which) => {
  const seen = new Set([320, 4000]);
  for (const m of bareStyles.matchAll(new RegExp(`(?:min|max)-${which}:\\s*(\\d+)px`, 'g'))) {
    const n = Number(m[1]);
    seen.add(n - 1);
    seen.add(n);
    seen.add(n + 1);
  }
  return [...seen].filter((n) => n >= 320);
};
