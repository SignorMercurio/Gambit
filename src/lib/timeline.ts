// Timeline parser. Input format (one event per line):
//   [mm:ss] move                    (SAN — may carry a trailing !!/!/?/?? annotation)
//   [mm:ss] highlight a1,b2,... [pin]
//   [mm:ss] arrow a1→b2 [pin]       (or a1->b2)
//   [mm:ss] clear                   (clears highlights and arrows)
//   [mm:ss] reset                   (resets the board to the configured start)
//   [mm:ss] branch                  (enters a variation; saves current world state)
//   [mm:ss] mainline                (exits the current variation; restores saved state)
// Branches nest: every `branch` must be paired with a later `mainline`.
// `pin` keeps a highlight or arrow on screen until the next `clear` or
// `reset`; without it they auto-fade after their lifetime window.
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

export type ParsedEvent =
  | { t: number; kind: 'move'; san: string; annotation?: MoveAnnotation; line: number; raw: string }
  | { t: number; kind: 'highlight'; squares: string[]; pinned?: boolean; line: number; raw: string }
  | { t: number; kind: 'arrow'; from: string; to: string; pinned?: boolean; line: number; raw: string }
  | { t: number; kind: 'clear'; line: number; raw: string }
  | { t: number; kind: 'reset'; line: number; raw: string }
  | { t: number; kind: 'branch'; line: number; raw: string }
  | { t: number; kind: 'mainline'; line: number; raw: string };

export type ErrorEvent = { t: number; error: string; line: number; raw: string; kind?: undefined };

export type TimelineEvent = ParsedEvent | ErrorEvent;

export function parseTime(s: string): number {
  const parts = s.split(':');
  if (parts.length === 1) return parseFloat(parts[0]);
  const m = parseInt(parts[0], 10) || 0;
  const sec = parseFloat(parts[1]) || 0;
  return m * 60 + sec;
}

export function parseScript(text: string): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    if (raw.startsWith('#') || raw.startsWith('//')) continue;
    const m = raw.match(/^\[\s*([0-9:.]+)\s*\]\s*(.+)$/);
    if (!m) {
      events.push({ t: 0, error: `Line ${i + 1}: missing [mm:ss]`, line: i + 1, raw });
      continue;
    }
    const t = parseTime(m[1]);
    const body = m[2].trim();

    const hm = body.match(/^highlight\s+(.+)$/i);
    if (hm) {
      const tokens = hm[1].split(/[,\s]+/).filter(Boolean);
      let pinned = false;
      if (tokens[tokens.length - 1]?.toLowerCase() === 'pin') {
        pinned = true;
        tokens.pop();
      }
      events.push({ t, kind: 'highlight', squares: tokens, pinned, line: i + 1, raw });
      continue;
    }
    const am = body.match(/^arrow\s+([a-h][1-8])\s*(?:→|->|to)\s*([a-h][1-8])(?:\s+(pin))?\s*$/i);
    if (am) {
      events.push({
        t,
        kind: 'arrow',
        from: am[1].toLowerCase(),
        to: am[2].toLowerCase(),
        pinned: !!am[3],
        line: i + 1,
        raw,
      });
      continue;
    }
    if (/^clear$/i.test(body)) {
      events.push({ t, kind: 'clear', line: i + 1, raw });
      continue;
    }
    if (/^reset$/i.test(body)) {
      events.push({ t, kind: 'reset', line: i + 1, raw });
      continue;
    }
    if (/^branch$/i.test(body)) {
      events.push({ t, kind: 'branch', line: i + 1, raw });
      continue;
    }
    if (/^mainline$/i.test(body)) {
      events.push({ t, kind: 'mainline', line: i + 1, raw });
      continue;
    }
    // `parseSAN` strips [+#!?]+ before resolving the move, so the trailing
    // marks can stay on the SAN string while still feeding the badge.
    let annotation: MoveAnnotation | undefined;
    const annotMatch = body.match(/[!?]+$/);
    if (annotMatch) annotation = ANNOTATION_BY_MARK[annotMatch[0]];
    events.push({ t, kind: 'move', san: body, annotation, line: i + 1, raw });
  }
  events.sort((a, b) => a.t - b.t);
  return events;
}
