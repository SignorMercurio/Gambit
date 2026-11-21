// Gesture-to-script writer: pure text operations that insert or retime one
// timestamped line while preserving the author's comments, blank lines and
// formatting, plus the pure gesture planners built on them. A board gesture
// is just another way to type a line. Line recognition and rewriting are the
// parser's own (timeline.ts), so scans always track its line shape.
import {
  formatScriptTime,
  lastEventIndexAt,
  parseScriptLine,
  rewriteScriptLineTime,
  type ParsedEvent,
  type TimelineEvent,
} from './timeline';
import { isValidScriptTimestamp, MAX_SCRIPT_TIMESTAMP_SECONDS } from './playback';

// Decisecond-grid boundaries shared by every scanner: `capDeci` converts an
// exclusive upper bound; `firstDeciAbove` is the first slot strictly above a
// (possibly off-grid or infinite) time, so rounding never slips a stamp back
// across the previous event. A finite `limit` is always a parsed, already
// valid timestamp, so it needs no clamp to the ceiling.
const MAX_SCRIPT_DECI = Math.round(MAX_SCRIPT_TIMESTAMP_SECONDS * 10);
const capDeci = (limit: number): number =>
  Number.isFinite(limit) ? Math.round(limit * 10) : MAX_SCRIPT_DECI + 1;

function firstDeciAbove(t: number): number {
  if (!Number.isFinite(t)) return 0;
  const deci = Math.max(0, Math.round(t * 10));
  return deci / 10 > t ? deci : deci + 1;
}

// Timestamps used by script lines, in deciseconds; computed once per plan
// from the text it started from.
function takenDeciseconds(text: string): Set<number> {
  const taken = new Set<number>();
  for (const line of text.split('\n')) {
    const lt = parseScriptLine(line)?.t;
    if (lt != null) taken.add(Math.round(lt * 10));
  }
  return taken;
}

// `gaps.length + 1` free timestamps at/after `from`, each at least its gap
// after the previous, all strictly below `limit` and strictly above `floor`
// (the previous event). `step` is how far the preferred layout jumps past a
// taken stamp. If that layout does not fit, retries with 0.1s steps and
// halved gaps, then 0.1s gaps; null means the caller reports a conflict.
function findSlots(
  taken: ReadonlySet<number>,
  from: number,
  gaps: number[],
  limit: number,
  floor: number,
  step = 0.1,
): number[] | null {
  if (!isValidScriptTimestamp(from)) return null;
  const limitDeci = capDeci(limit);
  const layout = (gapsDeci: number[], stepDeci: number): number[] | null => {
    const slots: number[] = [];
    let t = Math.max(Math.round(from * 10), firstDeciAbove(floor));
    for (let i = 0; i <= gapsDeci.length; i++) {
      while (taken.has(t)) t += stepDeci;
      if (t >= limitDeci) return null;
      slots.push(t);
      t += gapsDeci[i] ?? 0;
    }
    return slots;
  };
  const deciGaps = gaps.map((g) => Math.max(1, Math.round(g * 10)));
  const slots =
    layout(deciGaps, Math.max(1, Math.round(step * 10))) ??
    layout(deciGaps.map((g) => Math.max(1, Math.round(g / 2))), 1) ??
    layout(gaps.map(() => 1), 1);
  return slots ? slots.map((d) => d / 10) : null;
}

// Nearest free decisecond strictly below `t` and strictly above `floor`.
function nearestFreeTimeBelow(taken: ReadonlySet<number>, t: number, floor: number): number | null {
  const lowest = firstDeciAbove(floor);
  const start = Math.min(MAX_SCRIPT_DECI + 1, Math.round(t * 10)) - 1;
  for (let d = start; d >= lowest; d--) {
    if (!taken.has(d)) return d / 10;
  }
  return null;
}

// Null, not the untouched text, so a failed retime surfaces as a conflict
// instead of leaving a colliding timestamp behind.
function retimeLine(text: string, line: number, t: number): string | null {
  const lines = text.split('\n');
  const idx = line - 1;
  if (idx < 0 || idx >= lines.length) return null;
  const retimed = rewriteScriptLineTime(lines[idx], t);
  if (retimed == null) return null;
  lines[idx] = retimed;
  return lines.join('\n');
}

// Retimes in place when the line stays chronological among its textual
// neighbors (keeping attached comments); otherwise relocates it to its
// time-sorted position.
type LineTimeEdit = { text: string; line: number | null };

export function setLineTime(text: string, line: number, t: number): LineTimeEdit {
  if (!isValidScriptTimestamp(t)) return { text, line: null };
  // Decide on the grid the written stamp rounds to, or the chronology check
  // could disagree with the written order.
  const roundedT = Math.round(t * 10) / 10;
  const lines = text.split('\n');
  const idx = line - 1;
  if (idx < 0 || idx >= lines.length) return { text, line: null };
  let prev: number | null = null;
  for (let i = idx - 1; i >= 0 && prev == null; i--) prev = parseScriptLine(lines[i])?.t ?? null;
  let next: number | null = null;
  for (let i = idx + 1; i < lines.length && next == null; i++) {
    next = parseScriptLine(lines[i])?.t ?? null;
  }
  if ((prev == null || prev <= roundedT) && (next == null || roundedT <= next)) {
    const retimed = retimeLine(text, line, roundedT);
    return retimed == null ? { text, line: null } : { text: retimed, line };
  }
  const parsed = parseScriptLine(lines[idx]);
  if (!parsed) return { text, line: null };
  lines.splice(idx, 1);
  return insertScriptLineInto(lines, roundedT, parsed.body);
}

// Lines are 1-based. Comments stay in place; their attachment is the author's.
export function removeLines(text: string, targets: number[]): string {
  const lines = text.split('\n');
  const targetIndexes = new Set(targets.map((line) => line - 1));
  return lines.filter((_, index) => !targetIndexes.has(index)).join('\n');
}

// Inserts `[t] body` before the first later line and before the comment/blank
// run attached to it, so comments stay with the section they introduce (a run
// at the top of the file is a header and stays put). With no later event it
// appends before trailing blank lines.
function insertScriptLineInto(lines: string[], t: number, body: string): LineTimeEdit {
  const entry = `${formatScriptTime(t)} ${body}`;
  let insertAt = -1;
  let blockStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const lt = parseScriptLine(lines[i])?.t;
    if (lt == null) continue;
    if (lt > t) {
      insertAt = blockStart > 0 ? blockStart : i;
      break;
    }
    blockStart = i + 1;
  }
  if (insertAt === -1) {
    insertAt = lines.length;
    while (insertAt > 0 && lines[insertAt - 1].trim() === '') insertAt--;
  }
  lines.splice(insertAt, 0, entry);
  return { text: lines.join('\n'), line: insertAt + 1 };
}

// ---------------------------------------------------------------------------
// Gesture planners: pure policy. A plan carries new text plus the landing
// boundaries (`t` and the first event strictly after it); the caller owns
// the commit, undo snapshot and paused-playhead landing.

export type ScriptEditPlan =
  | { kind: 'edit'; text: string; t: number; nextT?: number }
  | { kind: 'conflict'; error: string };

type MoveGesturePlan =
  | { kind: 'seek'; t: number }
  | ScriptEditPlan;

const NO_FREE_SLOT_ERROR =
  'Cannot record this gesture: no free 0.1s slot before the next scripted event. Move the playhead or retime the neighboring event.';
const NO_VARIATION_ROOM_ERROR =
  'Cannot record this move: not enough free 0.1s slots to preserve the scripted main line. Move the playhead or retime the neighboring event.';

// Stamps `body` at the playhead, stepping 0.5s past taken stamps so repeated
// paused gestures spread out, strictly before the next event so the line
// lands on the position the gesture previewed.
export function planLineInsert(
  events: TimelineEvent[],
  scriptText: string,
  time: number,
  body: string,
): ScriptEditPlan {
  const idx = lastEventIndexAt(events, time);
  const bound = events[idx + 1];
  // A playhead parked just before the next event rounds up onto the cap, so
  // start one tick under it. The clamp stays out of `findSlots`, where it
  // would turn the variation-extend layout's conflicts into recorded moves.
  const from = bound ? Math.min(time, (capDeci(bound.t) - 1) / 10) : time;
  const slot = findSlots(
    takenDeciseconds(scriptText),
    from,
    [],
    bound ? bound.t : Infinity,
    events[idx]?.t ?? -Infinity,
    0.5,
  );
  if (!slot) return { kind: 'conflict', error: NO_FREE_SLOT_ERROR };
  const [t] = slot;
  return {
    kind: 'edit',
    text: insertScriptLineInto(scriptText.split('\n'), t, body).text,
    t,
    // The slot lies strictly inside (events[idx].t, bound.t), so `bound` is
    // also the event after the written line.
    nextT: bound?.t,
  };
}

// Branch-aware move-gesture planner, lichess-style. The first later event
// that touches chess state decides the mode:
//   none / fen / rs / st  → plain insert;
//   the same move         → seek to it, record nothing;
//   a different move / br → wrap the gesture in its own br/ml variation;
//   ml                    → extend the open variation, pushing its ml later
//                           when the new move would land on or past it.
// When br/ml cannot fit before the next event, report a conflict rather than
// fall back to a plain insert, which could silently change what a later SAN
// resolves to. The main line is never altered, reordered, or deleted.
// `matchesScripted` resolves a scripted SAN against the gestured move.
export function planMoveGesture(
  events: TimelineEvent[],
  scriptText: string,
  time: number,
  san: string,
  matchesScripted: (scriptedSan: string) => boolean,
  rejectedEventIndexes: ReadonlySet<number>,
): MoveGesturePlan {
  const prevIdx = lastEventIndexAt(events, time);
  // Every layout is floored strictly after the event the playhead sits on.
  const prevT = events[prevIdx]?.t ?? -Infinity;
  let stateEv: ParsedEvent | null = null;
  let stateIdx = -1;
  for (let i = prevIdx + 1; i < events.length; i++) {
    const e = events[i];
    if ('error' in e) continue;
    // A malformed FEN cannot cut continuity. A rejected SAN still counts: the
    // gestured move could make it legal and silently revive it.
    if (rejectedEventIndexes.has(i) && e.kind === 'fen') continue;
    if (
      e.kind === 'move' ||
      e.kind === 'fen' ||
      e.kind === 'reset' ||
      e.kind === 'start' ||
      e.kind === 'branch' ||
      e.kind === 'mainline'
    ) {
      stateEv = e;
      stateIdx = i;
      break;
    }
  }

  if (!stateEv || stateEv.kind === 'fen' || stateEv.kind === 'reset' || stateEv.kind === 'start') {
    return planLineInsert(events, scriptText, time, san);
  }

  if (stateEv.kind === 'move' && matchesScripted(stateEv.san)) {
    return { kind: 'seek', t: stateEv.t };
  }

  // Both layouts below scan the text as it was before this gesture.
  const taken = takenDeciseconds(scriptText);

  if (stateEv.kind === 'mainline') {
    const mlCap = (events[stateIdx + 1]?.t ?? Infinity) - 0.1;
    const slot = findSlots(taken, time, [], mlCap, prevT);
    if (!slot) return { kind: 'conflict', error: NO_VARIATION_ROOM_ERROR };
    const [mvT] = slot;
    let text = scriptText;
    let mlT = stateEv.t;
    if (mlT <= mvT) {
      // The pushed ml needs a free slot: a tie breaks by textual order and
      // would silently decide another line's variation membership.
      const pushed = Math.min(mvT + 1, mlCap);
      const free = nearestFreeTimeBelow(taken, pushed + 0.1, mvT);
      if (free == null) return { kind: 'conflict', error: NO_VARIATION_ROOM_ERROR };
      mlT = free;
      const retimed = retimeLine(text, stateEv.line, mlT);
      if (retimed == null) return { kind: 'conflict', error: NO_VARIATION_ROOM_ERROR };
      text = retimed;
    }
    // Land short of the first event of any kind after the move (an annotation
    // may sit before the ml); if that event is the ml, use its new time.
    const afterMv = events[lastEventIndexAt(events, mvT) + 1];
    const nextT = afterMv && afterMv !== stateEv ? Math.min(afterMv.t, mlT) : mlT;
    const { text: extended } = insertScriptLineInto(text.split('\n'), mvT, san);
    return { kind: 'edit', text: extended, t: mvT, nextT };
  }

  // Wrap: the move lands on the playhead. `br`'s time is ordering-only, so it
  // tucks into the nearest free slot below; without room, fall back to br at
  // the playhead and the move after. The layout must fit before the next
  // event of any kind, or an annotation caught before the generated `ml`
  // would be absorbed into the variation and reverted by the restore.
  const boundT = events[prevIdx + 1]?.t ?? Infinity;
  let placed: { brT: number; mvT: number; mlT: number } | null = null;
  const pair = findSlots(taken, time, [1], boundT, prevT);
  if (pair) {
    const brT = nearestFreeTimeBelow(taken, pair[0], prevT);
    if (brT != null) placed = { brT, mvT: pair[0], mlT: pair[1] };
  }
  if (!placed) {
    const slots = findSlots(taken, time, [0.5, 1], boundT, prevT);
    if (slots) placed = { brT: slots[0], mvT: slots[1], mlT: slots[2] };
  }
  if (!placed) return { kind: 'conflict', error: NO_VARIATION_ROOM_ERROR };
  const lines = scriptText.split('\n');
  insertScriptLineInto(lines, placed.brT, 'br');
  insertScriptLineInto(lines, placed.mvT, san);
  const { text } = insertScriptLineInto(lines, placed.mlT, 'ml');
  return { kind: 'edit', text, t: placed.mvT, nextT: placed.mlT };
}
