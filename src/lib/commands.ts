// The script language's one catalogue: every event kind the parser accepts,
// with its token, the words that select it, how its argument parses, and one
// line of prose. The parser dispatches on it, and the insert menu and the Text
// view's hint read it; test/commands.test.mjs chains it to `markerColors`, so
// a new kind is one entry here and cannot stay invisible in the UI. Kinds that
// need arguments carry `via` (where they are authored) instead of inserting a
// template that would parse as an error.

import type { EventFields } from './timeline';
import type { MarkerKind } from './tokens';

// A worded command's reading of what follows its word: the event's fields, or
// an error message for the errors band. `word` is the word as typed.
type CommandParse = (argument: string, word: string) => EventFields | string;

export type CommandEntry = {
  // The canonical short token, also inserted for commands with no `via` route.
  token: string;
  // One line for someone who never read the docs: the app's only syntax reference.
  hint: string;
  // Where it is authored instead of being inserted from the menu.
  via?: string;
  kind: MarkerKind;
  // Written form, when the token alone doesn't show the shape of the syntax.
  syntax?: string;
  // The token this one closes, as the back half of a pair. Declared, not read
  // off array order, so reordering the catalogue cannot invent pairs.
  closes?: string;
  // The leading words that select this command, matched case-insensitively:
  // the token and its long alias. SAN and arrows have none (`parseArrow`).
  words?: readonly string[];
  parse?: CommandParse;
};

// Whole seconds keep the countdown digit and ring on one beat; the ceiling
// bounds how long one line can cover the subtitle track.
const ASK_MIN_SECONDS = 1;
export const ASK_MAX_SECONDS = 30;

const SQUARE = '[a-h][1-8]';
const SQUARE_RE = new RegExp(`^${SQUARE}$`, 'i');
const ARROW_RE = new RegExp(
  `^(?:arrow\\s+)?(${SQUARE})\\s*(?:→|->|to)\\s*(${SQUARE})(?:\\s+(pin))?$`,
  'i',
);

type SimpleKind = Extract<
  EventFields['kind'],
  'clear' | 'reset' | 'start' | 'branch' | 'mainline' | 'mind' | 'reveal'
>;

// A stray argument (`cl e4`) is reported, never read as SAN.
const bare =
  (kind: SimpleKind): CommandParse =>
  (argument, word) =>
    argument ? `${word} takes no arguments` : { kind };

// An arrow is recognised by its shape, not a leading word: `a1->b2`, `a1→b2`
// or `a1 to b2`, optionally prefixed `arrow` and suffixed `pin`. Null when the
// line is not an arrow at all; a line that starts `arrow` and is not one is an
// arrow error rather than SAN.
export function parseArrow(body: string): EventFields | string | null {
  const match = body.match(ARROW_RE);
  if (!match) return /^arrow\b/i.test(body) ? 'invalid arrow' : null;
  return {
    kind: 'arrow',
    from: match[1].toLowerCase(),
    to: match[2].toLowerCase(),
    pinned: !!match[3],
  };
}

const parseHighlight: CommandParse = (argument) => {
  const tokens = argument.split(/[,\s]+/).filter(Boolean);
  let pinned = false;
  if (tokens[tokens.length - 1]?.toLowerCase() === 'pin') {
    pinned = true;
    tokens.pop();
  }
  if (tokens.length === 0) return 'hl needs at least one square, like: hl e4 d5';
  const invalid = tokens.filter((sq) => !SQUARE_RE.test(sq));
  if (invalid.length > 0) return `invalid highlight square: ${invalid.join(', ')}`;
  return { kind: 'highlight', squares: [...new Set(tokens.map((sq) => sq.toLowerCase()))], pinned };
};

const parseReplay: CommandParse = (argument) => {
  if (!argument) return { kind: 'replay' };
  // One decimal place keeps replay frame times on the decisecond grid.
  const step = /^\d+(?:\.\d)?$/.test(argument) ? Number(argument) : NaN;
  return step >= 0.1 && step <= 10
    ? { kind: 'replay', step }
    : 'replay step must be 0.1–10 seconds in 0.1s increments';
};

// The seconds come first so the question can be any text, digits included:
// `ask 3 3 步之内怎么杀？` is a 3s card, never an argument-order guess.
const parseAsk: CommandParse = (argument) => {
  const match = argument.match(/^(\d+)\s+(\S.*)$/);
  if (!match) return 'ask needs seconds and a question, like: ask 3 Which move wins?';
  const seconds = Number(match[1]);
  if (seconds < ASK_MIN_SECONDS || seconds > ASK_MAX_SECONDS) {
    return `ask countdown must be ${ASK_MIN_SECONDS}–${ASK_MAX_SECONDS} whole seconds`;
  }
  return { kind: 'ask', seconds, text: match[2] };
};

export const COMMANDS: readonly CommandEntry[] = [
  {
    token: 'SAN',
    kind: 'move',
    syntax: 'e4 · Nf3',
    hint: 'A move in standard notation, castling as O-O. Suffix ! ? !! ?? to mark its quality.',
    via: 'Drag a piece on the board',
  },
  {
    token: 'hl',
    kind: 'highlight',
    syntax: 'hl e4 f6',
    hint: 'Highlight one or more squares. They fade on their own; add pin to hold until cl.',
    via: 'Right-click a square',
    words: ['hl', 'highlight'],
    parse: parseHighlight,
  },
  {
    token: '->',
    kind: 'arrow',
    syntax: 'f3->e5',
    hint: 'Draw an arrow between two squares.',
    via: 'Right-drag between squares',
  },
  {
    token: 'cl',
    kind: 'clear',
    hint: 'Clear every highlight and arrow currently on the board.',
    words: ['cl', 'clear'],
    parse: bare('clear'),
  },
  {
    token: 'rs',
    kind: 'reset',
    hint: 'Reset to the Start FEN set in Setup.',
    words: ['rs', 'reset'],
    parse: bare('reset'),
  },
  {
    token: 'st',
    kind: 'start',
    hint: 'Reset to the standard opening position.',
    words: ['st', 'start'],
    parse: bare('start'),
  },
  {
    token: 'fen',
    kind: 'fen',
    syntax: 'fen …',
    hint: 'Jump to an arbitrary position mid-script, given as a full FEN string.',
    via: 'Set a position in Setup, or type it in Text',
    words: ['fen', 'setfen'],
    parse: (argument) => (argument ? { kind: 'fen', fen: argument } : 'missing FEN'),
  },
  {
    token: 'br',
    kind: 'branch',
    hint: 'Open a variation. Renders nothing — its timestamp only sets order.',
    words: ['br', 'branch'],
    parse: bare('branch'),
  },
  {
    token: 'ml',
    kind: 'mainline',
    closes: 'br',
    hint: 'Close the variation. This timestamp is the visible snap back.',
    words: ['ml', 'mainline'],
    parse: bare('mainline'),
  },
  {
    token: 'rp',
    kind: 'replay',
    syntax: 'rp · rp 1',
    hint: 'Replay the main line from the start, 0.5s per move — or give seconds per move (0.1–10).',
    words: ['rp', 'replay'],
    parse: parseReplay,
  },
  {
    token: 'mind',
    kind: 'mind',
    hint: "Mind's eye: the board goes dark and only squares the script names keep their pieces.",
    words: ['mind'],
    parse: bare('mind'),
  },
  {
    token: 'reveal',
    kind: 'reveal',
    closes: 'mind',
    hint: "End mind's eye and fade the full position back in.",
    words: ['reveal'],
    parse: bare('reveal'),
  },
  {
    token: 'ask',
    kind: 'ask',
    syntax: 'ask 3 …',
    hint: 'Pose a question under the board with a countdown of the given seconds (1–30).',
    via: 'Type it in Text',
    words: ['ask'],
    parse: parseAsk,
  },
];

// Word to parser, for the script parser's dispatch. A Map, so `constructor`
// and other object-prototype names stay SAN candidates.
export const COMMAND_PARSERS: ReadonlyMap<string, CommandParse> = new Map(
  COMMANDS.flatMap(({ words, parse }) =>
    words && parse ? words.map((word) => [word, parse] as const) : [],
  ),
);

// `via` alone decides insertability; the rest insert their token verbatim.
// Both lists are module constants, so the menu never filters on render.
export const INSERTABLE_COMMANDS: readonly CommandEntry[] = COMMANDS.filter(
  (c) => c.via == null,
);

export const AUTHORED_ELSEWHERE_COMMANDS: readonly CommandEntry[] = COMMANDS.filter(
  (c) => c.via != null,
);

// The Text view's syntax reference, grouped with pairs joined. `->` alone
// reads as punctuation, so it borrows its entry's `syntax`, keeping one
// example spelling across the hint and the menu.
export const SYNTAX_GROUPS: readonly (readonly string[])[] = COMMANDS.reduce<
  { opener: string; names: string[] }[]
>((groups, c) => {
  const name = c.token === '->' ? (c.syntax ?? c.token) : c.token;
  const last = groups[groups.length - 1];
  if (c.closes != null && last?.opener === c.closes) last.names.push(name);
  else groups.push({ opener: c.token, names: [name] });
  return groups;
}, []).map((g) => g.names);
