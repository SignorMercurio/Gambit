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
//   [mm:ss] rp [seconds]            (or replay; replays prior mainline moves,
//                                    0.5s per move unless a step is given)
// Branches nest: every `br` must be paired with a later `ml`.
// `pin` keeps a highlight or arrow on screen until the next `cl`, `rs`, `st`, or `fen`;
// without it they auto-fade after their lifetime window.
// Lines starting with # or // are comments.

import { parseSANSuffix } from './chess';
import {
  isValidScriptTimestamp,
  MAX_SAFE_PLAYBACK_SECONDS,
  MAX_SCRIPT_TIMESTAMP_SECONDS,
} from './playback';

// Move quality marks. `!?` / `?!` (interesting / dubious) are intentionally
// not supported: the four below are the universal pedagogical set and give
// the badge layer one color per mark with no overlap.
export type MoveAnnotation = 'brilliant' | 'great' | 'mistake' | 'blunder';

export const ANNOTATION_MARKS: Record<MoveAnnotation, string> = {
  brilliant: '!!',
  great: '!',
  mistake: '?',
  blunder: '??',
};
const ANNOTATION_BY_MARK = Object.fromEntries(
  Object.entries(ANNOTATION_MARKS).map(([annotation, mark]) => [mark, annotation]),
) as Record<string, MoveAnnotation>;

// One event line: `[time] body` (non-empty body). This is the single home of
// the line shape for parsing, collision scans, and timestamp rewrites. The
// captures preserve indentation and authored whitespace when a line is
// retimed in place.
const SCRIPT_LINE_RE = /^(\s*)\[\s*([0-9:.]+)\s*\](\s*)(\S(?:.*\S)?)(\s*)$/;

// Blanks and comments — lines the parser skips entirely.
function isSkippedLine(raw: string): boolean {
  return !raw || raw.startsWith('#') || raw.startsWith('//');
}

type ScriptLine = { t: number; body: string };
type ScriptLineMatch = ScriptLine & {
  indent: string;
  gap: string;
  trailing: string;
};

function matchScriptLine(line: string): ScriptLineMatch | null {
  const match = line.match(SCRIPT_LINE_RE);
  if (!match) return null;
  return {
    indent: match[1],
    t: parseTime(match[2]),
    gap: match[3],
    body: match[4],
    trailing: match[5],
  };
}

// Public consumers only receive valid event lines. parseScript uses the
// internal structural match below to keep its missing-vs-invalid error split.
export function parseScriptLine(line: string): ScriptLine | null {
  const match = matchScriptLine(line);
  return match && Number.isFinite(match.t) ? { t: match.t, body: match.body } : null;
}

// Timestamp of a script line, or null for blanks, comments, and lines the
// parser would reject — including a bare `[00:05]` (a parse error), which
// is not a timed anchor either.
export function scriptLineTime(line: string): number | null {
  const parsed = parseScriptLine(line);
  return parsed?.t ?? null;
}

// Rewrites only a valid event line and preserves everything after its closing
// bracket byte-for-byte. Invalid lines are left to parseScript's visible error
// path instead of being silently normalized into valid input.
export function rewriteScriptLineTime(line: string, t: number): string | null {
  const match = matchScriptLine(line);
  if (!match || !isValidScriptTimestamp(match.t) || !isValidScriptTimestamp(t)) return null;
  return `${match.indent}${formatScriptTime(t)}${match.gap}${match.body}${match.trailing}`;
}

// SAN with its trailing quality marks split off, plus the badge that mark
// names. Shared by the parser (badge derivation) and the move list (mark
// coloring) so the mark vocabulary can't drift between the two — and so a
// caller holding a mark never has to cross back to the badge itself.
export function splitSanAnnotation(san: string): { text: string } & (
  | { mark: string; annotation: MoveAnnotation }
  | { mark: null; annotation?: undefined }
) {
  const suffix = parseSANSuffix(san);
  if (!suffix?.annotation) return { text: san, mark: null };
  return {
    text: suffix.text + (suffix.check ?? ''),
    mark: suffix.annotation,
    annotation: ANNOTATION_BY_MARK[suffix.annotation],
  };
}

const SQUARE_PATTERN = '[a-h][1-8]';
const SQUARE_RE = new RegExp(`^${SQUARE_PATTERN}$`, 'i');
const ARROW_PATTERN = `(${SQUARE_PATTERN})\\s*(?:→|->|to)\\s*(${SQUARE_PATTERN})(?:\\s+(pin))?`;
const ARROW_RE = new RegExp(`^(?:arrow\\s+)?${ARROW_PATTERN}$`, 'i');
const MAX_SCRIPT_CHARACTERS = 1_000_000;
export const MAX_SCRIPT_LINES = 5_000;

// Every outcome retains the same timestamp and authored source location.
type EventSource = { t: number; line: number; raw: string };

export type ParsedEvent = EventSource & (
  | { kind: 'move'; san: string; annotation?: MoveAnnotation }
  | { kind: 'highlight'; squares: string[]; pinned?: boolean }
  | { kind: 'arrow'; from: string; to: string; pinned?: boolean }
  | { kind: 'clear' }
  | { kind: 'reset' }
  | { kind: 'start' }
  | { kind: 'fen'; fen: string }
  | { kind: 'branch' }
  | { kind: 'mainline' }
  | { kind: 'replay'; step?: number }
  | { kind: 'mind' }
  | { kind: 'reveal' }
);

export type ErrorEvent = EventSource & { error: string; kind?: undefined };

export type TimelineEvent = ParsedEvent | ErrorEvent;

type SimpleEventKind = Extract<
  ParsedEvent['kind'],
  'clear' | 'reset' | 'start' | 'branch' | 'mainline' | 'replay' | 'mind' | 'reveal'
>;

const SIMPLE_COMMANDS = new Map<string, SimpleEventKind>([
  ['cl', 'clear'],
  ['clear', 'clear'],
  ['rs', 'reset'],
  ['reset', 'reset'],
  ['st', 'start'],
  ['start', 'start'],
  ['br', 'branch'],
  ['branch', 'branch'],
  ['ml', 'mainline'],
  ['mainline', 'mainline'],
  ['rp', 'replay'],
  ['replay', 'replay'],
  ['mind', 'mind'],
  ['reveal', 'reveal'],
]);

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
  if (match[1] && seconds >= 60) return NaN;
  const total = minutes * 60 + seconds;
  return isValidScriptTimestamp(total) ? total : NaN;
}

function safeTimelineTime(t: number): number {
  if (!Number.isFinite(t)) return 0;
  return Math.min(MAX_SAFE_PLAYBACK_SECONDS, Math.max(0, t));
}

// Deciseconds via `Math.floor(t*10)` avoids 9.95→10 rollover.
// `fine`: 'never' = mm:ss; 'auto' = mm:ss[.t] when fractional; 'always' = mm:ss.t.
export function fmtTime(t: number, fine: 'never' | 'auto' | 'always' = 'never'): string {
  // The clock readout floors: elapsed time never shows ahead of itself.
  return fmtDeci(Math.floor(safeTimelineTime(t) * 10), fine);
}

// Format a decisecond count. Grid-exact surfaces (time chips, script lines)
// should round to deciseconds first and format through this, so display and
// written text can never disagree by a tenth.
export function fmtDeci(deci: number, fine: 'never' | 'auto' | 'always' = 'never'): string {
  const totalDeciseconds = Number.isFinite(deci)
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(deci)))
    : 0;
  const totalSeconds = Math.floor(totalDeciseconds / 10);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  const tenths = totalDeciseconds % 10;
  const head = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  if (fine === 'never') return head;
  if (fine === 'auto' && tenths === 0) return head;
  return `${head}.${tenths}`;
}

// `[mm:ss]`, or `[mm:ss.t]` when the tenths are non-zero — the house style
// for generated and retimed script lines.
export function formatScriptTime(t: number): string {
  const scriptTime = Math.min(MAX_SCRIPT_TIMESTAMP_SECONDS, safeTimelineTime(t));
  return `[${fmtDeci(Math.round(scriptTime * 10), 'auto')}]`;
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
    case 'replay':
      return e.step != null ? `replay mainline · ${e.step}s/move` : 'replay mainline';
    case 'mind':
      return "mind's eye";
    case 'reveal':
      return 'reveal board';
  }
}

export function parseScript(text: string): TimelineEvent[] {
  if (text.length > MAX_SCRIPT_CHARACTERS) {
    return [{
      t: 0,
      error: `Script exceeds the ${MAX_SCRIPT_CHARACTERS.toLocaleString('en-US')}-character limit`,
      line: 1,
      raw: '',
    }];
  }
  const events: TimelineEvent[] = [];
  const lines = text.split('\n', MAX_SCRIPT_LINES + 1);
  if (lines.length > MAX_SCRIPT_LINES) {
    return [{
      t: 0,
      error: `Script exceeds the ${MAX_SCRIPT_LINES.toLocaleString('en-US')}-line limit`,
      line: MAX_SCRIPT_LINES + 1,
      raw: lines[MAX_SCRIPT_LINES].trim(),
    }];
  }
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (isSkippedLine(raw)) continue;
    const matched = matchScriptLine(raw);
    if (!matched) {
      events.push({ t: 0, error: `Line ${i + 1}: missing [mm:ss]`, line: i + 1, raw });
      continue;
    }
    const { t, body } = matched;
    if (!Number.isFinite(t)) {
      events.push({ t: 0, error: `Line ${i + 1}: invalid timestamp`, line: i + 1, raw });
      continue;
    }

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
      const squares = [...new Set(tokens.map((sq) => sq.toLowerCase()))];
      events.push({ t, kind: 'highlight', squares, pinned, line: i + 1, raw });
      continue;
    }
    const arrowMatch = body.match(ARROW_RE);
    if (arrowMatch) {
      events.push(toArrowEvent(t, i + 1, raw, arrowMatch));
      continue;
    }
    if (/^arrow\b/i.test(body)) {
      events.push({ t, error: `Line ${i + 1}: invalid arrow`, line: i + 1, raw });
      continue;
    }
    // Derived from the table rather than by restating its keys. The alias set
    // is spelled only in SIMPLE_COMMANDS, so a body that names a command but
    // carries something after it — `cl e4`, `br 1`, `mind x` — reports that
    // instead of falling through to SAN and being told it is bad chess.
    // Carrying no argument is these kinds' normal form, so it is decided once
    // for all eight; replay is the one kind that accepts an argument, and that
    // is keyed on the kind so the table stays the only place aliases are spelled.
    const firstWord = body.split(/\s+/)[0].toLowerCase();
    const simpleKind = SIMPLE_COMMANDS.get(firstWord);
    if (simpleKind) {
      const argument = body.slice(firstWord.length).trim();
      if (!argument) {
        events.push({ t, kind: simpleKind, line: i + 1, raw });
        continue;
      }
      if (simpleKind === 'replay') {
        // One decimal place keeps the step on the decisecond grid every other
        // timestamp lives on, so replay frame times never leave it.
        const step = /^\d+(?:\.\d)?$/.test(argument) ? Number(argument) : NaN;
        if (step >= 0.1 && step <= 10) {
          events.push({ t, kind: 'replay', step, line: i + 1, raw });
        } else {
          events.push({
            t,
            error: `Line ${i + 1}: replay step must be 0.1–10 seconds in 0.1s increments`,
            line: i + 1,
            raw,
          });
        }
        continue;
      }
      events.push({
        t,
        error: `Line ${i + 1}: ${firstWord} takes no arguments`,
        line: i + 1,
        raw,
      });
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
    // The chess parser owns the strict SAN suffix grammar; the timeline only
    // derives a badge when that shared parser recognizes a supported mark.
    const { annotation } = splitSanAnnotation(body);
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
