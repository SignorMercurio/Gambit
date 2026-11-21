// SRT parsing and cue lookup.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load } from './support.mjs';

const {
  formatSubtitleText,
  getActiveSubtitle,
  getSubtitleEnd,
  parseSrt,
} = await load('/src/lib/subtitles.ts');

test('the latest-started active cue wins, falling back to a longer one', async () => {
  const overlappingCues = [
    { start: 0, end: 10, text: 'long', line: 1 },
    { start: 1, end: 2, text: 'short', line: 2 },
    { start: 3, end: 4, text: 'later', line: 3 },
  ];
  assert.equal(getSubtitleEnd(overlappingCues), 10);
  assert.equal(getActiveSubtitle(overlappingCues, 1.5)?.text, 'short');
  assert.equal(getActiveSubtitle(overlappingCues, 2.5)?.text, 'long');
  assert.equal(getActiveSubtitle(overlappingCues, 20), null);
});

test('malformed cues are reported by line and parsing carries on', async () => {
  const missingBlank = 'missing blank line before subtitle cue';
  for (const [srt, texts, errors] of [
    [
      `1
00:00:00,000 --> 00:00:01,000
First
2
00:00:01,000 --> 00:00:02,000
Second`,
      ['First', 'Second'],
      [{ line: 4, error: missingBlank }],
    ],
    [
      `1
not a timestamp
broken
2
00:00:01,000 --> 00:00:02,000
Recovered`,
      ['Recovered'],
      [
        { line: 1, error: 'invalid SRT timestamp' },
        { line: 4, error: missingBlank },
      ],
    ],
    [
      `00:00:00,000 --> 00:00:01,000
First
00:00:01,000 --> 00:00:02,000
Second`,
      ['First', 'Second'],
      [{ line: 3, error: missingBlank }],
    ],
    [
      `1
00:00:00,000 --> 00:00:02,000
2024
Look --> there`,
      ['2024\nLook --> there'],
      [],
    ],
    // An index line only counts as a cue boundary when the line under it parses
    // as a time range, so a backwards range leaves the playhead on the index line
    // and the timestamp error names that line.
    [
      `1
00:00:02,000 --> 00:00:01,000
text`,
      [],
      [{ line: 1, error: 'invalid SRT timestamp' }],
    ],
  ]) {
    const parsed = parseSrt(srt);
    assert.deepEqual(parsed.cues.map((cue) => cue.text), texts);
    assert.deepEqual(parsed.errors, errors);
  }
});

test('a BOM and CRLF line ends parse like the plain file', async () => {
  // Cue lines still count from the top of the file.
  assert.deepEqual(
    parseSrt('\ufeff1\r\n00:00:01,5 --> 00:00:02,500\r\nHello\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nWorld\r\n'),
    {
      cues: [
        { start: 1.5, end: 2.5, text: 'Hello', line: 1 },
        { start: 3, end: 4, text: 'World', line: 5 },
      ],
      errors: [],
    },
  );
});

test('each malformed cue names its own problem', async () => {
  assert.deepEqual(parseSrt('00:00:02,000 --> 00:00:01,000\ntext').errors, [
    { line: 1, error: 'invalid SRT time range' },
  ]);
  const emptyCue = parseSrt('1\n00:00:01,000 --> 00:00:02,000\n\n2\n00:00:03,000 --> 00:00:04,000\nok');
  assert.deepEqual(emptyCue.errors, [{ line: 1, error: 'empty subtitle cue' }]);
  assert.deepEqual(emptyCue.cues.map((cue) => cue.text), ['ok']);
});

test('oversized subtitle text is refused up front', async () => {
  // Parsing an oversized paste would stall every keystroke.
  assert.match(parseSrt('x'.repeat(1_000_001)).errors[0].error, /1,000,000-character limit/);
  assert.deepEqual(parseSrt('\n'.repeat(10_000)).errors, [
    { line: 10_001, error: 'subtitle text exceeds the 10,000-line limit' },
  ]);
});

test('the strip spaces Chinese apart from SAN', async () => {
  // Check/mate marks stay with their SAN; already-spaced or single-script text
  // is left alone.
  for (const [raw, shown] of [
    ['用Nf3控制e5', '用 Nf3 控制 e5'],
    ['Qxf7#将杀', 'Qxf7# 将杀'],
    ['e4 开局', 'e4 开局'],
    ['Nf3, e5.', 'Nf3, e5.'],
  ]) {
    assert.equal(formatSubtitleText(raw), shown, raw);
  }
});
