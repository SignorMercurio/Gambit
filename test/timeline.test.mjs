// The script parser and its time formats.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load } from './support.mjs';

const {
  parseScript,
  parseScriptLine,
  parseTime,
  fmtTime,
  rewriteScriptLineTime,
  splitSanAnnotation,
  ANNOTATION_MARKS,
  MAX_SCRIPT_LINES,
} = await load('/src/lib/timeline.ts');
const { MAX_SCRIPT_TIMESTAMP_SECONDS } = await load('/src/lib/playback.ts');

test('rp and replay parse as one kind, with an optional step', async () => {
  const replayAliases = parseScript('[1] rp\n[2] replay\n[3] replay 1');
  assert.deepEqual(replayAliases.map((event) => event.kind), ['replay', 'replay', 'replay']);
  assert.deepEqual(replayAliases.map((event) => event.step), [undefined, undefined, 1]);
});

test('script lines parse and retime through one grammar', async () => {
  // Rewrites preserve authored whitespace; malformed or body-less lines stay
  // invalid rather than being repaired by the structured editor.
  assert.deepEqual(parseScriptLine('  [ 0:05.1 ]   hl e4 pin  '), {
    t: 5.1,
    body: 'hl e4 pin',
  });
  assert.equal(
    rewriteScriptLineTime('  [ 0:05.1 ]   hl e4 pin  ', 7.2),
    '  [00:07.2]   hl e4 pin  ',
  );
  assert.equal(parseScriptLine('// [00:01] e4'), null);
  assert.equal(parseScriptLine('[1::2] e4'), null);
  assert.equal(rewriteScriptLineTime('[00:05]   ', 7), null);
  assert.equal(rewriteScriptLineTime('[00:05] e4', Number.NaN), null);
  assert.match(parseScript('[1::2] e4')[0].error, /invalid timestamp/i);
});

test('timestamps keep seconds under 60 and stop at the authored ceiling', async () => {
  assert.ok(Number.isNaN(parseTime('00:60')), 'colon timestamps keep seconds below 60');
  assert.equal(parseTime('60'), 60, 'plain seconds remain a supported shorthand');
  assert.match(parseScript('[00:99] e4')[0].error, /invalid timestamp/i);
  assert.ok(
    Number.isNaN(parseTime(`1${'0'.repeat(308)}`)),
    'timestamps beyond safe decisecond arithmetic fail visibly',
  );
  assert.equal(
    parseTime(String(MAX_SCRIPT_TIMESTAMP_SECONDS)),
    MAX_SCRIPT_TIMESTAMP_SECONDS,
  );
  assert.ok(Number.isNaN(parseTime(String(MAX_SCRIPT_TIMESTAMP_SECONDS + 1))));
});

test('hl deduplicates repeated squares', async () => {
  // Normalized at parse time so one short line cannot fan out into an
  // arbitrarily large SVG subtree.
  const dedupedHighlight = parseScript('[00:01] hl e4,E4,e4,d5')[0];
  assert.deepEqual(dedupedHighlight.squares, ['e4', 'd5']);
});

test('a script over the line limit is a single error', async () => {
  const oversizedScript = Array.from(
    { length: MAX_SCRIPT_LINES + 1 },
    (_, index) => `# ${index}`,
  ).join('\n');
  const oversizedEvents = parseScript(oversizedScript);
  assert.equal(oversizedEvents.length, 1);
  assert.match(oversizedEvents[0].error, /line limit/i);
});

test('a script over the character limit is a single error', async () => {
  // One newline-free line, so only the character check can catch it. The bound
  // is spelled out because `MAX_SCRIPT_CHARACTERS` is private to `timeline.ts`.
  const oversizedByCharacters = parseScript('x'.repeat(1_000_001));
  assert.equal(oversizedByCharacters.length, 1);
  assert.match(oversizedByCharacters[0].error, /1,000,000-character limit/);
  assert.match(
    parseScript('x'.repeat(1_000_000))[0].error,
    /missing \[mm:ss\]/,
    'a script exactly at the limit reaches the line grammar',
  );
});

test('quality marks split off the SAN and name their badge', async () => {
  assert.deepEqual(splitSanAnnotation('Qxf7#!!'), {
    text: 'Qxf7#',
    mark: '!!',
    annotation: 'brilliant',
  });
  assert.deepEqual(
    splitSanAnnotation('e4!?'),
    { text: 'e4!?', mark: null },
    'unsupported marks stay intact on the visible invalid SAN',
  );
  for (const [annotation, mark] of Object.entries(ANNOTATION_MARKS)) {
    assert.equal(
      parseScript(`[1] e4${mark}`)[0].annotation,
      annotation,
      `a parsed ${mark} suffix names the ${annotation} badge`,
    );
  }
});

test('an argument-free command rejects an argument by name', async () => {
  // Not a fall-through to SAN ("bad chess"). `rp` is the one argument-free
  // command that takes one.
  assert.match(parseScript('[1] cl e4')[0].error, /cl takes no arguments/i);
  // The errors band and Moves view already tag each row with its line; the
  // message itself must not repeat it.
  assert.equal(parseScript('[1] cl e4')[0].error, 'cl takes no arguments');

  assert.match(parseScript('[1] mind x')[0].error, /mind takes no arguments/i);
});

test('a bare hl or fen names what is missing', async () => {
  for (const bare of ['hl', 'highlight', 'hl pin']) {
    assert.match(parseScript(`[1] ${bare}`)[0].error ?? '', /hl needs at least one square/, bare);
  }
  assert.match(parseScript('[1] hl e4 z9')[0].error, /invalid highlight square: z9/);
  for (const bare of ['fen', 'setfen', 'FEN']) {
    assert.equal(parseScript(`[1] ${bare}`)[0].error, 'missing FEN', bare);
  }

  assert.equal(parseScript('[1] fen 8/8/8/8/8/8/8/8 w - - 0 1')[0].kind, 'fen');
});

test('an invalid rp step is a parse error', async () => {
  for (const bad of ['rp 0', 'rp 11', 'rp 0.85', 'rp abc', 'replay -1']) {
    const [event] = parseScript(`[1] ${bad}`);
    assert.match(
      event.error ?? '',
      /replay step/i,
      `'${bad}' must be rejected as an invalid replay step`,
    );
  }
});

test('the clock readout never formats Infinity or NaN', async () => {
  assert.doesNotMatch(fmtTime(Number.MAX_VALUE), /Infinity|NaN/);
});
