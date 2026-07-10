// Timeline parser. Input format (one event per line):
//   [mm:ss] move                    (SAN — may carry a trailing !!/!/?/?? annotation)
//   [mm:ss] hl a1,b2,... [pin]      (or highlight)
//   [mm:ss] a1→b2 [pin]             (or a1->b2, arrow a1->b2)
//   [mm:ss] cl                      (or clear; clears highlights and arrows)
//   [mm:ss] rs                      (or reset; resets to configured start)
//   [mm:ss] st                      (or start; resets to standard initial position)
//   [mm:ss] fen <FEN>               (or setfen; sets board to that FEN)
//   [mm:ss] br                      (or branch; enters a variation)
//   [mm:ss] ml                      (or mainline; exits current variation)
// Branches nest: every `br` must be paired with a later `ml`.
// `pin` keeps a highlight or arrow on screen until the next `cl`, `rs`, `st`, or `fen`;
// without it they auto-fade after their lifetime window.
// Lines starting with # or // are comments.

// Move quality marks. `!?` / `?!` (interesting / dubious) are intentionally
// not supported: the four below are the universal pedagogical set and give
// the badge layer one color per mark with no overlap.
export type MoveAnnotation = 'brilliant' | 'great' | 'mistake' | 'blunder';

const ANNOTATION_BY_MARK: Record<string, MoveAnnotation> = {
  '!!': 'brilliant',
  '!': 'great',
  '?': 'mistake',
  '??': 'blunder',
};

// One event line: `[time] body` (non-empty body). The single home of the
// line shape — scriptLineTime and parseScript both match through it, so the
// gesture writer's collision detection can never drift from parse order.
const SCRIPT_LINE_RE = /^\[\s*([0-9:.]+)\s*\]\s*(.+)$/;

// Blanks and comments — lines the parser skips entirely.
function isSkippedLine(raw: string): boolean {
  return !raw || raw.startsWith('#') || raw.startsWith('//');
}

// Timestamp of a script line, or null for blanks, comments, and lines the
// parser would reject — including a bare `[00:05]` (a parse error), which
// is not a timed anchor either.
export function scriptLineTime(line: string): number | null {
  const raw = line.trim();
  if (isSkippedLine(raw)) return null;
  const m = raw.match(SCRIPT_LINE_RE);
  if (!m) return null;
  const t = parseTime(m[1]);
  return Number.isFinite(t) ? t : null;
}

// SAN with its trailing quality marks split off. Shared by the parser (badge
// derivation) and the move list (mark coloring) so the mark vocabulary can't
// drift between the two.
export function splitSanAnnotation(san: string): { text: string; mark: string | null } {
  const m = san.match(/[!?]+$/);
  return m ? { text: san.slice(0, -m[0].length), mark: m[0] } : { text: san, mark: null };
}

const SQUARE_PATTERN = '[a-h][1-8]';
const SQUARE_RE = new RegExp(`^${SQUARE_PATTERN}$`, 'i');
const ARROW_PATTERN = `(${SQUARE_PATTERN})\\s*(?:→|->|to)\\s*(${SQUARE_PATTERN})(?:\\s+(pin))?`;
const DIRECT_ARROW_RE = new RegExp(`^${ARROW_PATTERN}$`, 'i');
const LEGACY_ARROW_RE = new RegExp(`^arrow\\s+${ARROW_PATTERN}$`, 'i');

export type ParsedEvent =
  | { t: number; kind: 'move'; san: string; annotation?: MoveAnnotation; line: number; raw: string }
  | { t: number; kind: 'highlight'; squares: string[]; pinned?: boolean; line: number; raw: string }
  | { t: number; kind: 'arrow'; from: string; to: string; pinned?: boolean; line: number; raw: string }
  | { t: number; kind: 'clear'; line: number; raw: string }
  | { t: number; kind: 'reset'; line: number; raw: string }
  | { t: number; kind: 'start'; line: number; raw: string }
  | { t: number; kind: 'fen'; fen: string; line: number; raw: string }
  | { t: number; kind: 'branch'; line: number; raw: string }
  | { t: number; kind: 'mainline'; line: number; raw: string };

export type ErrorEvent = { t: number; error: string; line: number; raw: string; kind?: undefined };

export type TimelineEvent = ParsedEvent | ErrorEvent;

type SimpleEventKind = Extract<ParsedEvent['kind'], 'clear' | 'reset' | 'start' | 'branch' | 'mainline'>;

const SIMPLE_COMMANDS: Record<string, SimpleEventKind> = {
  cl: 'clear',
  clear: 'clear',
  rs: 'reset',
  reset: 'reset',
  st: 'start',
  start: 'start',
  initial: 'start',
  br: 'branch',
  branch: 'branch',
  ml: 'mainline',
  mainline: 'mainline',
};

function toArrowEvent(t: number, line: number, raw: string, match: RegExpMatchArray): ParsedEvent {
  return {
    t,
    kind: 'arrow',
    from: match[1].toLowerCase(),
    to: match[2].toLowerCase(),
    pinned: !!match[3],
    line,
    raw,
  };
}

export function parseTime(s: string): number {
  const text = s.trim();
  const match = text.match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);
  if (!match) return NaN;
  const minutes = match[1] ? parseInt(match[1], 10) : 0;
  const seconds = parseFloat(match[2]);
  return minutes * 60 + seconds;
}

// Deciseconds via `Math.floor(t*10)` avoids 9.95→10 rollover.
// `fine`: 'never' = mm:ss; 'auto' = mm:ss[.t] when fractional; 'always' = mm:ss.t.
export function fmtTime(t: number, fine: 'never' | 'auto' | 'always' = 'never'): string {
  // The clock readout floors: elapsed time never shows ahead of itself.
  return fmtDeci(Math.max(0, Math.floor(t * 10)), fine);
}

// Format a decisecond count. Grid-exact surfaces (time chips, script lines)
// should round to deciseconds first and format through this, so display and
// written text can never disagree by a tenth.
export function fmtDeci(deci: number, fine: 'never' | 'auto' | 'always' = 'never'): string {
  const totalDeciseconds = Math.max(0, deci);
  const totalSeconds = Math.floor(totalDeciseconds / 10);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  const tenths = totalDeciseconds % 10;
  const head = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  if (fine === 'never') return head;
  if (fine === 'auto' && tenths === 0) return head;
  return `${head}.${tenths}`;
}

// Human-readable event body shared by the move list and its tooltips.
export function eventBody(e: ParsedEvent): string {
  switch (e.kind) {
    case 'move':
      return e.san;
    case 'highlight':
      return e.squares.join(', ');
    case 'arrow':
      return `${e.from} → ${e.to}`;
    case 'clear':
      return 'cleared annotations';
    case 'reset':
      return 'board reset';
    case 'start':
      return 'initial position';
    case 'fen':
      return e.fen;
    case 'branch':
      return 'begin variation';
    case 'mainline':
      return 'end variation';
  }
}

export function parseScript(text: string): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (isSkippedLine(raw)) continue;
    const m = raw.match(SCRIPT_LINE_RE);
    if (!m) {
      events.push({ t: 0, error: `Line ${i + 1}: missing [mm:ss]`, line: i + 1, raw });
      continue;
    }
    const t = parseTime(m[1]);
    if (!Number.isFinite(t)) {
      events.push({ t: 0, error: `Line ${i + 1}: invalid timestamp`, line: i + 1, raw });
      continue;
    }
    const body = m[2].trim();

    const hm = body.match(/^(?:hl|highlight)\s+(.+)$/i);
    if (hm) {
      const tokens = hm[1].split(/[,\s]+/).filter(Boolean);
      let pinned = false;
      if (tokens[tokens.length - 1]?.toLowerCase() === 'pin') {
        pinned = true;
        tokens.pop();
      }
      const invalid = tokens.filter((sq) => !SQUARE_RE.test(sq));
      if (tokens.length === 0 || invalid.length > 0) {
        const detail = invalid.length > 0 ? `: ${invalid.join(', ')}` : '';
        events.push({ t, error: `Line ${i + 1}: invalid highlight square${detail}`, line: i + 1, raw });
        continue;
      }
      events.push({ t, kind: 'highlight', squares: tokens.map((sq) => sq.toLowerCase()), pinned, line: i + 1, raw });
      continue;
    }
    const arrowMatch = body.match(DIRECT_ARROW_RE) ?? body.match(LEGACY_ARROW_RE);
    if (arrowMatch) {
      events.push(toArrowEvent(t, i + 1, raw, arrowMatch));
      continue;
    }
    if (/^arrow\b/i.test(body)) {
      events.push({ t, error: `Line ${i + 1}: invalid arrow`, line: i + 1, raw });
      continue;
    }
    const simpleKind = SIMPLE_COMMANDS[body.toLowerCase()];
    if (simpleKind) {
      events.push({ t, kind: simpleKind, line: i + 1, raw });
      continue;
    }
    const fenMatch = body.match(/^(?:fen|setfen)\s+(.+)$/i);
    if (fenMatch) {
      events.push({ t, kind: 'fen', fen: fenMatch[1].trim(), line: i + 1, raw });
      continue;
    }
    if (/^(?:fen|setfen)$/i.test(body)) {
      events.push({ t, error: `Line ${i + 1}: missing FEN`, line: i + 1, raw });
      continue;
    }
    // `parseSAN` strips [+#!?]+ before resolving the move, so the trailing
    // marks can stay on the SAN string while still feeding the badge.
    const { mark } = splitSanAnnotation(body);
    const annotation = mark ? ANNOTATION_BY_MARK[mark] : undefined;
    events.push({ t, kind: 'move', san: body, annotation, line: i + 1, raw });
  }
  events.sort((a, b) => a.t - b.t);
  return events;
}

// Largest index i such that events[i].t <= time, or -1 when none. Events
// with t === time count as reached (inclusive on the lower side). The single
// home of the playhead→event-index rule: the world snapshot pick, the move
// list, the follow-scroll, and the gesture planners all derive from this.
export function lastEventIndexAt(events: TimelineEvent[], time: number): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (events[mid].t <= time) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}
