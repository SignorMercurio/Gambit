type SubtitleCue = {
  start: number;
  end: number;
  text: string;
  line: number;
};

type SubtitleParseError = {
  line: number;
  error: string;
};

type SubtitleParseResult = {
  cues: SubtitleCue[];
  errors: SubtitleParseError[];
};

const SRT_TIME_RE = /^(\d+):([0-5]\d):([0-5]\d)(?:[,.](\d{1,3}))?$/;
const CJK_PATTERN = '[\\u3400-\\u9fff\\uf900-\\ufaff]';
const CJK_BEFORE_ALNUM_RE = new RegExp(`(${CJK_PATTERN})([A-Za-z0-9])`, 'g');
const ALNUM_BEFORE_CJK_RE = new RegExp(`([A-Za-z0-9+#)\\]])(${CJK_PATTERN})`, 'g');
const CUE_END_PREFIX_CACHE = new WeakMap<SubtitleCue[], number[]>();

function cueEndPrefixes(cues: SubtitleCue[]): number[] {
  const cached = CUE_END_PREFIX_CACHE.get(cues);
  if (cached) return cached;
  const prefixes: number[] = [];
  let maxEnd = 0;
  for (const cue of cues) {
    maxEnd = Math.max(maxEnd, cue.end);
    prefixes.push(maxEnd);
  }
  CUE_END_PREFIX_CACHE.set(cues, prefixes);
  return prefixes;
}

function parseSrtTime(token: string): number {
  const match = token.trim().match(SRT_TIME_RE);
  if (!match) return NaN;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const millis = match[4] ? parseInt(match[4].padEnd(3, '0'), 10) : 0;
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

export function parseSrt(text: string): SubtitleParseResult {
  const cues: SubtitleCue[] = [];
  const errors: SubtitleParseError[] = [];
  const lines = text.replace(/^\ufeff/, '').replace(/\r/g, '').split('\n');
  let i = 0;

  const skipBlock = () => {
    while (i < lines.length && lines[i].trim()) i++;
  };

  while (i < lines.length) {
    while (i < lines.length && !lines[i].trim()) i++;
    if (i >= lines.length) break;

    const blockLine = i + 1;
    if (/^\d+$/.test(lines[i].trim()) && lines[i + 1]?.includes('-->')) i++;

    const timeLine = lines[i]?.trim() ?? '';
    const timeMatch = timeLine.match(/^(.+?)\s*-->\s*(.+?)(?:\s+.*)?$/);
    if (!timeMatch) {
      errors.push({ line: blockLine, error: 'invalid SRT timestamp' });
      skipBlock();
      continue;
    }

    const start = parseSrtTime(timeMatch[1]);
    const end = parseSrtTime(timeMatch[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      errors.push({ line: i + 1, error: 'invalid SRT time range' });
      skipBlock();
      continue;
    }

    i++;
    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim()) {
      textLines.push(lines[i]);
      i++;
    }

    const cueText = textLines.join('\n').trim();
    if (!cueText) {
      errors.push({ line: blockLine, error: 'empty subtitle cue' });
      continue;
    }

    cues.push({ start, end, text: cueText, line: blockLine });
  }

  cues.sort((a, b) => a.start - b.start || a.end - b.end);
  return { cues, errors };
}

export function getSubtitleEnd(cues: SubtitleCue[]): number {
  const prefixes = cueEndPrefixes(cues);
  return prefixes[prefixes.length - 1] ?? 0;
}

export function getActiveSubtitle(cues: SubtitleCue[], time: number): SubtitleCue | null {
  let lo = 0;
  let hi = cues.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (cues[mid].start <= time) lo = mid + 1;
    else hi = mid;
  }
  const endPrefixes = cueEndPrefixes(cues);
  for (let i = lo - 1; i >= 0; i--) {
    const cue = cues[i];
    if (cue.end > time && time >= cue.start) return cue;
    // No earlier cue can still be active once the whole preceding prefix has
    // ended. This keeps overlapping-cue semantics without rescanning history
    // on every playback frame in the common non-overlapping case.
    if (i === 0 || endPrefixes[i - 1] <= time) break;
  }
  return null;
}

export function formatSubtitleText(text: string): string {
  return text
    .replace(CJK_BEFORE_ALNUM_RE, '$1 $2')
    .replace(ALNUM_BEFORE_CJK_RE, '$1 $2');
}
