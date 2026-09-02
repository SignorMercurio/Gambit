// The script language's one catalogue: every event kind the parser accepts,
// with the body text that writes it and a line of prose explaining it.
//
// This exists because the language outgrew its interface. `src/lib/timeline.ts`
// parses twelve kinds; the Text view's hint line named ten and the default
// script demonstrates a handful, so `mind`, `reveal`, and the `pin` modifier
// shipped with no surface at all — a feature nobody can find has not really
// shipped. Both syntax surfaces now read this list — the insert menu's rows and
// that same hint line — and the regression suite parses every `body` below, so
// a thirteenth kind cannot be added to the parser while quietly staying
// invisible in the UI.
//
// Eight of the twelve take no argument, and those eight are exactly the ones
// with no other input path: they insert with a single click. The three that
// need squares already have board gestures — the catalogue points at the
// gesture rather than inserting a template that would parse as an error the
// moment it lands. `fen` needs a whole position, which is Setup's job.

import type { MarkerKind } from './tokens';

export type CommandEntry = {
  // The canonical short token, shown as the row's monospaced name.
  token: string;
  // Full script body to insert, or null when this kind is authored elsewhere.
  body: string | null;
  // What it does, in one line. Written for someone who has never read
  // DESIGN.md — this doubles as the app's only syntax reference.
  hint: string;
  // Where it comes from instead, when `body` is null.
  via?: string;
  // Shares the pins' and seek dots' color vocabulary, so a kind reads the
  // same in the menu, the ruler, and the move list.
  kind: MarkerKind;
  // Written form, when the body alone doesn't show the shape of the syntax.
  syntax?: string;
  // The token this one closes, when it is the back half of a pair. Declared
  // here rather than inferred from adjacency in the array below: the syntax
  // line renders a pair as one unwrappable unit, and reading that relation off
  // array order means reordering the catalogue silently invents pairs that do
  // not exist (`rp / reveal` if `rp` ever moves between `mind` and `reveal`).
  closes?: string;
};

export const COMMANDS: readonly CommandEntry[] = [
  {
    token: 'SAN',
    body: null,
    kind: 'move',
    syntax: 'e4 · Nf3',
    hint: 'A move in standard notation, castling as O-O. Suffix ! ? !! ?? to mark its quality.',
    via: 'Drag a piece on the board',
  },
  {
    token: 'hl',
    body: null,
    kind: 'highlight',
    syntax: 'hl e4 f6',
    hint: 'Highlight one or more squares. They fade on their own; add pin to hold until cl.',
    via: 'Right-click a square',
  },
  {
    token: '->',
    body: null,
    kind: 'arrow',
    syntax: 'f3->e5',
    hint: 'Draw an arrow between two squares.',
    via: 'Right-drag between squares',
  },
  {
    token: 'cl',
    body: 'cl',
    kind: 'clear',
    hint: 'Clear every highlight and arrow currently on the board.',
  },
  {
    token: 'rs',
    body: 'rs',
    kind: 'reset',
    hint: 'Reset to the Start FEN set in Setup.',
  },
  {
    token: 'st',
    body: 'st',
    kind: 'start',
    hint: 'Reset to the standard opening position.',
  },
  {
    token: 'fen',
    body: null,
    kind: 'fen',
    syntax: 'fen …',
    hint: 'Jump to an arbitrary position mid-script, given as a full FEN string.',
    via: 'Set a position in Setup, or type it in Text',
  },
  {
    token: 'br',
    body: 'br',
    kind: 'branch',
    hint: 'Open a variation. Renders nothing — its timestamp only sets order.',
  },
  {
    token: 'ml',
    body: 'ml',
    kind: 'mainline',
    closes: 'br',
    hint: 'Close the variation. This timestamp is the visible snap back.',
  },
  {
    token: 'rp',
    body: 'rp',
    kind: 'replay',
    syntax: 'rp · rp 1',
    hint: 'Replay the main line from the start, 0.5s per move — or give seconds per move (0.1–10).',
  },
  {
    token: 'mind',
    body: 'mind',
    kind: 'mind',
    hint: "Mind's eye: the board goes dark and only squares the script names keep their pieces.",
  },
  {
    token: 'reveal',
    body: 'reveal',
    kind: 'reveal',
    closes: 'mind',
    hint: "End mind's eye and fade the full position back in.",
  },
];

// The subset the insert menu can write directly. Derived rather than a second
// hand-maintained list, and typed with a non-null `body` so the menu's click
// handler needs no cast to hand it to planLineInsert.
type InsertableCommand = CommandEntry & { body: string };

export const INSERTABLE_COMMANDS: readonly InsertableCommand[] = COMMANDS.filter(
  (c): c is InsertableCommand => c.body != null,
);

// The complement: the kinds that need an argument and so are authored on
// another surface. Derived here beside its counterpart rather than filtered
// per render — the menu sits in the default view, which re-renders on every
// animation frame during playback.
export const AUTHORED_ELSEWHERE_COMMANDS: readonly CommandEntry[] = COMMANDS.filter(
  (c) => c.body == null,
);

// The Text view's one-line syntax reference, grouped. Derived here rather than
// written out in `App.tsx`, because what it needs is catalogue knowledge —
// which kinds exist, what each is called, and which two are halves of a pair —
// and a hand-maintained copy of that is the exact failure this file ends.
//
// `->` is the one token that is not a word: alone in a list it reads as
// punctuation, so it borrows the entry's own `syntax`. It must borrow rather
// than invent — the hint used to teach `a1->b2` while the insert menu two
// panels away taught `f3->e5`, one command with two example spellings.
export const SYNTAX_GROUPS: readonly (readonly string[])[] = COMMANDS.reduce<
  { opener: string; names: string[] }[]
>((groups, c) => {
  const name = c.token === '->' ? (c.syntax ?? c.token) : c.token;
  const last = groups[groups.length - 1];
  if (c.closes != null && last?.opener === c.closes) last.names.push(name);
  else groups.push({ opener: c.token, names: [name] });
  return groups;
}, []).map((g) => g.names);
