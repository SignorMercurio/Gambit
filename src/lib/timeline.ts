// Timeline parser. One event per line:
//   [mm:ss] <command word> [argument]   words and arguments: `commands.ts`
//   [mm:ss] a1->b2 [pin]                an arrow (also a1→b2, a1 to b2, arrow a1->b2)
//   [mm:ss] <SAN>                       anything else is a move, which may
//                                       carry a trailing !!/!/?/?? annotation
// Branches nest: every `br` must be paired with a later `ml`.
// `pin` keeps a highlight or arrow on screen until the next `cl`, `rs`, `st`, or `fen`;
// without it they auto-fade after their lifetime window.
// Lines starting with # or // are comments.

import { parseSANSuffix } from './chess';
import { COMMAND_PARSERS, parseArrow } from './commands';
import {
  isValidScriptTimestamp,
  MAX_SAFE_PLAYBACK_SECONDS,
  MAX_SCRIPT_TIMESTAMP_SECONDS,
} from './playback';

// Move quality marks. `!?` / `?!` are deliberately unsupported: one badge
// color per mark, with no overlap.
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

// The single home of the `[time] body` line shape, for parsing, collision
// scans and retiming. The captures preserve authored whitespace on retime.
const SCRIPT_LINE_RE = /^(\s*)\[\s*([0-9:.]+)\s*\](\s*)(\S(?:.*\S)?)(\s*)$/;

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

// Valid event lines only: null for blanks, comments, a bare `[00:05]`, and
// anything with an invalid timestamp.
export function parseScriptLine(line: string): ScriptLine | null {
  const match = matchScriptLine(line);
  return match && Number.isFinite(match.t) ? { t: match.t, body: match.body } : null;
}

// Rewrites only a valid event line, preserving everything after its bracket
// byte-for-byte; an invalid line is never silently normalized into valid input.
export function rewriteScriptLineTime(line: string, t: number): string | null {
  const match = matchScriptLine(line);
  if (!match || !isValidScriptTimestamp(match.t) || !isValidScriptTimestamp(t)) return null;
  return `${match.indent}${formatScriptTime(t)}${match.gap}${match.body}${match.trailing}`;
}

// SAN split from its quality mark, plus the badge it names. Shared by the
// parser and the move list so the mark vocabulary cannot drift.
export function splitSanAnnotation(san: string): { text: string } & (
  | { mark: string; annotation: MoveAnnotation }
  | { mark: null; annotation?: undefined }
) {
  const suffix = parseSANSuffix(san);
  if (!suffix?.annotation) return { text: san, mark: null };
  return {
    text: suffix.san,
    mark: suffix.annotation,
    annotation: ANNOTATION_BY_MARK[suffix.annotation],
  };
}

const MAX_SCRIPT_CHARACTERS = 1_000_000;
export const MAX_SCRIPT_LINES = 5_000;

type EventSource = { t: number; line: number; raw: string };

// What a line says, apart from where and when it says it.
export type EventFields =
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
  | { kind: 'ask'; seconds: number; text: string };

export type ParsedEvent = EventSource & EventFields;

export type ErrorEvent = EventSource & { error: string; kind?: undefined };

export type TimelineEvent = ParsedEvent | ErrorEvent;

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

// Floors to deciseconds, so elapsed time never shows ahead of itself.
// `fine`: 'never' = mm:ss; 'auto' = mm:ss[.t] when fractional; 'always' = mm:ss.t.
export function fmtTime(t: number, fine: 'never' | 'auto' | 'always' = 'never'): string {
  return fmtDeci(Math.floor(safeTimelineTime(t) * 10), fine);
}

// Grid-exact surfaces (time chips, script lines) round to deciseconds and
// format through this, so display and written text never disagree by a tenth.
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

// House style for generated and retimed lines: `[mm:ss]`, or `[mm:ss.t]`.
export function formatScriptTime(t: number): string {
  const scriptTime = Math.min(MAX_SCRIPT_TIMESTAMP_SECONDS, safeTimelineTime(t));
  return `[${fmtDeci(Math.round(scriptTime * 10), 'auto')}]`;
}

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
    case 'ask':
      return `${e.text} · ${e.seconds}s`;
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
    const line = i + 1;
    const fail = (t: number, error: string) => {
      events.push({ t, error, line, raw });
    };
    const matched = matchScriptLine(raw);
    if (!matched) {
      fail(0, 'missing [mm:ss]');
      continue;
    }
    const { t, body } = matched;
    if (!Number.isFinite(t)) {
      fail(0, 'invalid timestamp');
      continue;
    }
    const at = { t, line, raw };

    // A command word decides the line; a stray or missing argument is that
    // command's error, never a fall-through. Without one, the line is an
    // arrow or else SAN, whose suffix grammar the chess parser owns.
    const word = body.split(/\s+/)[0].toLowerCase();
    const parse = COMMAND_PARSERS.get(word);
    const parsed: EventFields | string = parse
      ? parse(body.slice(word.length).trim(), word)
      : (parseArrow(body) ?? {
          kind: 'move',
          san: body,
          annotation: splitSanAnnotation(body).annotation,
        });
    if (typeof parsed === 'string') fail(t, parsed);
    else events.push({ ...at, ...parsed });
  }
  events.sort((a, b) => a.t - b.t);
  return events;
}

// The latest reached `ask` while its countdown runs. A later ask replaces an
// earlier one outright: an expired latest means no card, even if an earlier
// window is still open.
export function activeAskAt(
  events: TimelineEvent[],
  time: number,
): Extract<ParsedEvent, { kind: 'ask' }> | null {
  for (let i = lastEventIndexAt(events, time); i >= 0; i--) {
    const event = events[i];
    if (event.kind === 'ask') return time < event.t + event.seconds ? event : null;
  }
  return null;
}

// Largest i with events[i].t <= time, or -1. The single playhead-to-event
// rule; an event at exactly `time` counts as reached.
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
