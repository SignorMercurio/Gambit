// The command catalogue and the surfaces derived from it.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { cssRules } from './css.mjs';
import { load } from './support.mjs';

const { parseScript } = await load('/src/lib/timeline.ts');
const { planLineInsert } = await load('/src/lib/scriptEdit.ts');
const {
  AUTHORED_ELSEWHERE_COMMANDS,
  COMMANDS,
  INSERTABLE_COMMANDS,
  SYNTAX_GROUPS,
} = await load('/src/lib/commands.ts');
const { SYNTAX_HINT } = await load('/src/components/SyntaxHint.tsx');
const { markerColors, markerForms } = await load('/src/lib/tokens.ts');

test('every parser kind is in the catalogue', async () => {
  // Chained to a table the compiler keeps exhaustive: markerColors is
  // Record<MarkerKind, string> with MarkerKind = ParsedEvent['kind'] | 'err',
  // so a new kind fails typecheck there and fails here until it is in COMMANDS.
  const parserKinds = new Set(Object.keys(markerColors).filter((k) => k !== 'err'));
  const cataloguedKinds = new Set(COMMANDS.map((c) => c.kind));
  assert.deepEqual(
    [...cataloguedKinds].sort(),
    [...parserKinds].sort(),
    'every parser event kind is listed in the insert menu catalogue',
  );
});

test('each one-click command inserts a line of its own kind', async () => {
  // Through the real insert path, not a hand-built line.
  for (const c of INSERTABLE_COMMANDS) {
    const plan = planLineInsert([], '', 1, c.token);
    assert.equal(plan.kind, 'edit', `${c.token} plans an edit into an empty script`);
    const events = parseScript(plan.text);
    assert.equal(events.length, 1, `${c.token} inserts exactly one event`);
    assert.equal(events[0].kind, c.kind, `${c.token} parses as the kind it advertises`);
  }
});

test('insertable and authored-elsewhere commands partition the catalogue', async () => {
  // Argument-free kinds insert; the ones needing a square, a position, or free
  // text route to the board, Setup, and Text.
  assert.equal(INSERTABLE_COMMANDS.length, 8);
  // Read through AUTHORED_ELSEWHERE_COMMANDS, the array the menu renders, not a
  // re-derived `c.via != null` that would leave the export untested.
  assert.deepEqual(
    AUTHORED_ELSEWHERE_COMMANDS.map((c) => c.kind).sort(),
    ['arrow', 'ask', 'fen', 'highlight', 'move'],
    'only the kinds with another authoring path opt out of one-click insert',
  );
  assert.equal(
    AUTHORED_ELSEWHERE_COMMANDS.length + INSERTABLE_COMMANDS.length,
    COMMANDS.length,
    'the two menu sections partition the catalogue — no command is unreachable',
  );
  for (const c of AUTHORED_ELSEWHERE_COMMANDS) {
    assert.ok(c.via, `${c.token} tells the user where it is authored instead`);
  }
});

test('the syntax hint names every kind exactly once', async () => {
  // Asserted on the rendered SYNTAX_HINT, not SYNTAX_GROUPS: rendering only
  // `group[0]` would silently drop `ml` and `reveal`.
  const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'" };
  const hint = renderToStaticMarkup(SYNTAX_HINT)
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|#x27);/g, (_, name) => ENTITIES[name]);
  for (const c of COMMANDS) {
    const name = c.token === '->' ? c.syntax : c.token;
    assert.ok(name, `${c.kind} has a name to print`);
    assert.equal(
      hint.split(name).length - 1,
      1,
      `the syntax line names ${c.kind} exactly once, as \`${name}\``,
    );
  }
  // `->` alone reads as punctuation, so the hint shows the catalogue's own
  // example move.
  assert.doesNotMatch(hint, /(?<![\w>])->(?![\w])/, 'the arrow is shown as a move, not as bare punctuation');
  // The separators are what make the pairs legible: a pair is one unit, and
  // `br / ml` must not read as two independent commands in a `·` list.
  assert.ok(hint.startsWith('[mm:ss.s] '), 'the line leads with the timestamp shape');
  assert.deepEqual(
    hint.slice('[mm:ss.s] '.length).split(' · '),
    SYNTAX_GROUPS.map((g) => g.join(' / ')),
    'every group renders, joined as a pair or standing alone',
  );
});

test('a pair names a real opener and stays adjacent to it', async () => {
  // A pair renders as one unwrappable unit, so `closes` has to name a real
  // token — and the two halves have to stay adjacent, or moving `rp` between
  // `mind` and `reveal` would render `rp / reveal` as a pair.
  const tokens_ = COMMANDS.map((c) => c.token);
  for (const c of COMMANDS) {
    if (c.closes == null) continue;
    assert.equal(
      tokens_[tokens_.indexOf(c.token) - 1],
      c.closes,
      `${c.token} sits directly after the ${c.closes} it closes, and that token exists`,
    );
  }
  assert.deepEqual(
    SYNTAX_GROUPS.filter((g) => g.length > 1),
    [['br', 'ml'], ['mind', 'reveal']],
    'the two paired kinds group, and nothing else does',
  );
});

test('two kinds that share a color differ in form', async () => {
  // A relation between two data tables, not CSS text. TypeScript keeps each
  // table exhaustive; it cannot state that kinds sharing a color differ in form.
  // The reset family shares one color because it shares one meaning.
  const RESET_FAMILY = new Set(['reset', 'start', 'fen', 'err']);
  const sharedColor = new Map();
  for (const [kind, color] of Object.entries(markerColors)) {
    const peers = sharedColor.get(color) ?? [];
    peers.push(kind);
    sharedColor.set(color, peers);
  }
  // Paired halves (named by `closes`) and the reset family are meant to look
  // alike; sameness is a bug only between independent kinds.
  const paired = (a, b) =>
    COMMANDS.some((c) => c.closes && COMMANDS.some((other) =>
      other.token === c.closes &&
      ((c.kind === a && other.kind === b) || (c.kind === b && other.kind === a)))) ||
    (RESET_FAMILY.has(a) && RESET_FAMILY.has(b));
  assert.equal(paired('clear', 'reveal'), false, 'a closer does not pair with unrelated commands');
  assert.equal(paired('mind', 'reveal'), true);
  for (const peers of sharedColor.values()) {
    const forms = peers.map((k) => markerForms[k]);
    for (const kind of peers) {
      assert.ok(markerForms[kind], `${kind} declares a pin form`);
    }
    for (let i = 0; i < peers.length; i += 1) {
      for (let j = i + 1; j < peers.length; j += 1) {
        if (paired(peers[i], peers[j])) continue;
        assert.notEqual(
          forms[i],
          forms[j],
          `${peers[i]} and ${peers[j]} share a marker color, so they must not share a pin form`,
        );
      }
    }
  }
});

test('every marker form has a stylesheet rule', async () => {
  for (const form of new Set(Object.values(markerForms))) {
    if (form === 'bar') continue; // the base `.marker` rule; no modifier needed
    assert.ok(
      cssRules(`.marker[data-form='${form}']`).length > 0,
      `the stylesheet draws the '${form}' pin form`,
    );
  }
});

test('every catalogued word selects its own command, never SAN', async () => {
  for (const { kind, token, words = [] } of COMMANDS) {
    if (words.length) assert.equal(words[0], token, 'the canonical token leads its words');
    for (const word of words) {
      // Bare, and in the other case: the line is the command or the command's
      // own complaint about a missing argument.
      const [event] = parseScript(`[1] ${word.toUpperCase()}`);
      assert.ok(event.kind === kind || 'error' in event, `${word} is read as ${kind}`);
    }
  }
  assert.deepEqual(
    COMMANDS.filter((c) => !c.words).map((c) => c.kind),
    ['move', 'arrow'],
    'only SAN and arrows are recognised by shape rather than by word',
  );
});
