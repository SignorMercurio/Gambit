// Gesture-to-script writer: pure text operations that insert one timestamped
// event line into the script while preserving the author's comments, blank
// lines, and formatting, plus the pure gesture planners built on them. The
// script text stays the single source of truth — a board gesture is just
// another way to type a line.

// Line recognition is parseScript's own (`scriptLineTime`), so collision
// detection and insertion anchors always track parse order exactly.
import {
  fmtDeci,
  lastEventIndexAt,
  scriptLineTime as lineTime,
  type ParsedEvent,
  type TimelineEvent,
} from './timeline';

// `[mm:ss]`, or `[mm:ss.t]` when the tenths are non-zero — the house style
// of hand-written scripts. Rounds to the decisecond grid and shares the
// formatter with the UI so written text and displayed chips never disagree.
function formatScriptTime(t: number): string {
  return `[${fmtDeci(Math.max(0, Math.round(t * 10)), 'auto')}]`;
}

// Timestamps already used by script lines, on the decisecond grid.
function takenDeciseconds(text: string): Set<number> {
  const taken = new Set<number>();
  for (const line of text.split('\n')) {
    const lt = lineTime(line);
    if (lt != null) taken.add(Math.round(lt * 10));
  }
  return taken;
}

// Smallest timestamp >= t (on the decisecond grid) not already used by a
// script line, stepping 0.5s at a time: successive gestures at a paused
// playhead spread out instead of stacking on one instant. `limit` caps the
// stamp strictly below the next scripted event — when the roomy stepping
// would cross it, retry with tight 0.1s steps so the line stays on the
// position the gesture previewed. `floor` keeps the stamp strictly above the
// previous event: grid rounding (and the cap-1 fallback below) may otherwise
// slip an off-grid timestamp's decisecond back across it, re-ordering the
// gesture onto a position it never previewed. A pinched or saturated
// interval returns null rather than crossing either boundary.
export function nextFreeTime(
  text: string,
  t: number,
  limit = Infinity,
  floor = -Infinity,
): number | null {
  const taken = takenDeciseconds(text);
  const limitDeci = Number.isFinite(limit) ? Math.round(limit * 10) : Infinity;
  const scan = (step: number, cap: number): number | null => {
    let deci = Math.max(0, Math.round(t * 10));
    // The paused playhead often rests 0.05s before the next event (the
    // landing convention), and rounding half-up then puts the scan start on
    // the cap itself even though t is below it. Any stamp strictly between
    // the neighboring events executes against the same position the gesture
    // previewed, so start one tick under the cap instead; if that slot is
    // taken the grid truly is saturated and the caller reports a conflict.
    if (Number.isFinite(cap) && deci >= cap) deci = Math.max(0, cap - 1);
    while (deci / 10 <= floor) deci += 1;
    while (taken.has(deci)) deci += step;
    return deci < cap ? deci / 10 : null;
  };
  return scan(5, limitDeci) ?? scan(1, limitDeci);
}

// `gaps.length + 1` free timestamps starting at/after `from`, each at least
// the given gap after the previous, all strictly below `limit`. Used to lay
// out multi-line structures (br / move / ml). When the preferred spacing
// does not fit under the limit, retries with tight 0.1s gaps; returns null
// when even that fails — the caller falls back to a plain insert when one
// slot remains, or reports an explicit conflict when the grid is saturated.
function findSlots(
  text: string,
  from: number,
  gaps: number[],
  limit = Infinity,
  floor = -Infinity,
): number[] | null {
  const taken = takenDeciseconds(text);
  const limitDeci = Number.isFinite(limit) ? Math.round(limit * 10) : Infinity;
  const layout = (gapsDeci: number[]): number[] | null => {
    const slots: number[] = [];
    let t = Math.max(0, Math.round(from * 10));
    // Same rule as nextFreeTime: rounding must not slip the first slot back
    // across the previous event's (possibly off-grid) timestamp.
    while (t / 10 <= floor) t += 1;
    for (let i = 0; i <= gapsDeci.length; i++) {
      while (taken.has(t)) t += 1;
      if (t >= limitDeci) return null;
      slots.push(t);
      t += gapsDeci[i] ?? 0;
    }
    return slots;
  };
  const deciGaps = gaps.map((g) => Math.max(1, Math.round(g * 10)));
  const slots =
    layout(deciGaps) ??
    layout(deciGaps.map((g) => Math.max(1, Math.round(g / 2)))) ??
    layout(gaps.map(() => 1));
  return slots ? slots.map((d) => d / 10) : null;
}

// Nearest free decisecond strictly below `t` and strictly above `floor`.
// A `br` timestamp is ordering-only (anything between the previous event and
// the variation's first move renders identically), so gesture wraps tuck it
// into whatever slot is free just before the move.
function nearestFreeTimeBelow(text: string, t: number, floor: number): number | null {
  const taken = takenDeciseconds(text);
  const floorDeci = Math.max(-1, Math.round(floor * 10));
  for (let d = Math.round(t * 10) - 1; d > floorDeci; d--) {
    if (!taken.has(d)) return d / 10;
  }
  return null;
}

// Rewrite the timestamp of an existing script line (1-based line number),
// leaving the body untouched. Used to push a variation's `ml` later as
// gestures grow the variation.
function retimeLine(text: string, line: number, t: number): string {
  const lines = text.split('\n');
  const idx = line - 1;
  if (idx < 0 || idx >= lines.length) return text;
  lines[idx] = lines[idx].replace(/^(\s*)\[[^\]]*\]/, `$1${formatScriptTime(t)}`);
  return lines.join('\n');
}

// Set an event line's time from the structured editor. When the new time
// keeps the line's chronological position among its textual neighbors, the
// timestamp is rewritten in place (preserving attached comments); when it
// crosses other events, the line is relocated to its time-sorted position so
// the text stays readable top-to-bottom.
type LineTimeEdit = { text: string; line: number | null };

export function setLineTime(text: string, line: number, t: number): LineTimeEdit {
  // Decide and write on the same decisecond grid: the written stamp rounds,
  // so an unrounded decision could place the line on the other side of a
  // textual neighbor than the chronology check assumed.
  const roundedT = Math.round(t * 10) / 10;
  const lines = text.split('\n');
  const idx = line - 1;
  if (idx < 0 || idx >= lines.length) return { text, line: null };
  let prev: number | null = null;
  for (let i = idx - 1; i >= 0 && prev == null; i--) prev = lineTime(lines[i]);
  let next: number | null = null;
  for (let i = idx + 1; i < lines.length && next == null; i++) next = lineTime(lines[i]);
  if ((prev == null || prev <= roundedT) && (next == null || roundedT <= next)) {
    lines[idx] = lines[idx].replace(
      /^(\s*)\[[^\]]*\]/,
      `$1${formatScriptTime(roundedT)}`,
    );
    return { text: lines.join('\n'), line };
  }
  const m = lines[idx].trim().match(/^\[\s*[0-9:.]+\s*\]\s*(.*)$/);
  if (!m) return { text, line: null };
  lines.splice(idx, 1);
  return insertScriptLineInto(lines, roundedT, m[1]);
}

// Remove a set of script lines (1-based). Comments are left in place — their
// attachment is the author's to manage in text mode.
export function removeLines(text: string, targets: number[]): string {
  const lines = text.split('\n');
  for (const line of [...new Set(targets)].sort((a, b) => b - a)) {
    const idx = line - 1;
    if (idx >= 0 && idx < lines.length) lines.splice(idx, 1);
  }
  return lines.join('\n');
}

// Insert `[t] body` in timestamp order: before the first line whose time
// exceeds t, and before the comment/blank run attached to that line so a
// comment stays glued to the section it introduces (a run at the very top
// of the file reads as a script header and stays put). With no later event
// the line is appended at the end, before trailing blank lines.
function insertScriptLineInto(lines: string[], t: number, body: string): LineTimeEdit {
  const entry = `${formatScriptTime(t)} ${body}`;
  let insertAt = -1;
  let blockStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const lt = lineTime(lines[i]);
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

function insertScriptLine(text: string, t: number, body: string): string {
  return insertScriptLineInto(text.split('\n'), t, body).text;
}

// ---------------------------------------------------------------------------
// Gesture planners: pure policy over the event stream and the text helpers
// above. A plan carries new script text plus the landing boundaries (`t` and
// the first event strictly after it) — the caller owns the React commit
// (undo snapshot, state updates, the paused-playhead jump between t/nextT).

export type ScriptEditPlan =
  | { kind: 'edit'; text: string; t: number; nextT?: number }
  | { kind: 'conflict'; error: string };

export type MoveGesturePlan =
  | { kind: 'seek'; t: number }
  | ScriptEditPlan;

const NO_FREE_SLOT_ERROR =
  'Cannot record this gesture: no free 0.1s slot before the next scripted event. Move the playhead or retime the neighboring event.';

// Plain insert: stamp `body` at the playhead, stepping +0.5s past taken
// stamps so successive paused gestures never stack on one instant, capped
// strictly before the next scripted event so the line stays on the position
// the gesture previewed.
export function planLineInsert(
  events: TimelineEvent[],
  scriptText: string,
  time: number,
  body: string,
): ScriptEditPlan {
  const idx = lastEventIndexAt(events, time);
  const bound = events[idx + 1];
  const t = nextFreeTime(scriptText, time, bound ? bound.t : Infinity, events[idx]?.t ?? -Infinity);
  if (t == null) return { kind: 'conflict', error: NO_FREE_SLOT_ERROR };
  return {
    kind: 'edit',
    text: insertScriptLine(scriptText, t, body),
    t,
    nextT: events[lastEventIndexAt(events, t) + 1]?.t,
  };
}

// Branch-aware move-gesture planner, lichess-style. The first later event
// that interacts with chess state decides the mode:
//   none / fen / rs / st  → plain insert (tail of the line, or a position
//                           reset re-establishes state anyway);
//   the same move         → seek to it, record nothing;
//   a different move / br → wrap the gesture in its own br/ml variation;
//   ml                    → extend the open variation, pushing its ml later
//                           when the new move would land on or past it.
// When the br/ml structure cannot fit before the next event, fall back to a
// plain insert when a slot remains; a saturated interval becomes an explicit
// conflict. Never silently reorder or delete the author's lines.
// `matchesScripted` answers "does this scripted SAN resolve to the gestured
// move?" — chess resolution stays with the caller.
export function planMoveGesture(
  events: TimelineEvent[],
  scriptText: string,
  time: number,
  san: string,
  matchesScripted: (scriptedSan: string) => boolean,
): MoveGesturePlan {
  const prevIdx = lastEventIndexAt(events, time);
  let stateEv: ParsedEvent | null = null;
  let stateIdx = -1;
  for (let i = prevIdx + 1; i < events.length; i++) {
    const e = events[i];
    if ('error' in e) continue;
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

  if (stateEv.kind === 'mainline') {
    const afterMl = events[stateIdx + 1];
    const cap = afterMl ? afterMl.t : Infinity;
    const prevT = events[prevIdx]?.t ?? -Infinity;
    const slot = findSlots(
      scriptText,
      time,
      [],
      Number.isFinite(cap) ? cap - 0.1 : Infinity,
      prevT,
    );
    if (!slot) return planLineInsert(events, scriptText, time, san);
    const [mvT] = slot;
    let text = scriptText;
    let mlT = stateEv.t;
    if (mlT <= mvT) {
      // The pushed ml must land on a free slot: a timestamp collision
      // would tie-break by textual order and silently decide another
      // line's variation membership.
      const pushed = Number.isFinite(cap) ? Math.min(mvT + 1, cap - 0.1) : mvT + 1;
      const free = nearestFreeTimeBelow(text, pushed + 0.1, mvT);
      if (free == null) return planLineInsert(events, scriptText, time, san);
      mlT = free;
      text = retimeLine(text, stateEv.line, mlT);
    }
    // The paused landing must stop short of the first event after the move
    // of ANY kind: an annotation inside the variation can sit between the
    // move and the (possibly pushed) ml, and landing on it would hit the
    // age-0 invisibility pitfall. When the next event is the ml itself, use
    // its (possibly pushed) new time.
    const afterMv = events[lastEventIndexAt(events, mvT) + 1];
    const nextT = afterMv && afterMv !== stateEv ? Math.min(afterMv.t, mlT) : mlT;
    return { kind: 'edit', text: insertScriptLine(text, mvT, san), t: mvT, nextT };
  }

  // A different move (or an explicit br): wrap. The move lands on the
  // playhead itself — that's the instant the narration means. `br`'s time is
  // ordering-only, so it tucks into the nearest free slot before the move;
  // when there's no room below, fall back to the forward layout (br at the
  // playhead, move after). The whole layout must fit before the next event
  // of ANY kind — an author's annotation caught between the move and the
  // generated `ml` would be absorbed into the variation and silently
  // reverted by the mainline restore.
  const boundT = events[prevIdx + 1]?.t ?? Infinity;
  const wrapFloor = events[prevIdx]?.t ?? -Infinity;
  let placed: { brT: number; mvT: number; mlT: number } | null = null;
  const pair = findSlots(scriptText, time, [1], boundT, wrapFloor);
  if (pair) {
    const brT = nearestFreeTimeBelow(scriptText, pair[0], prevIdx >= 0 ? events[prevIdx].t : -1);
    if (brT != null) placed = { brT, mvT: pair[0], mlT: pair[1] };
  }
  if (!placed) {
    const slots = findSlots(scriptText, time, [0.5, 1], boundT, wrapFloor);
    if (slots) placed = { brT: slots[0], mvT: slots[1], mlT: slots[2] };
  }
  if (!placed) return planLineInsert(events, scriptText, time, san);
  let text = insertScriptLine(scriptText, placed.brT, 'br');
  text = insertScriptLine(text, placed.mvT, san);
  text = insertScriptLine(text, placed.mlT, 'ml');
  return { kind: 'edit', text, t: placed.mvT, nextT: placed.mlT };
}
