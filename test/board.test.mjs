// Board gestures, orientation, and the geometry of its marks.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bareStyles, cssRule, axis } from './css.mjs';
import { load } from './support.mjs';

const {
  beginAnnotationGesture,
  beginMoveGesture,
  finishBoardGesture,
} = await load('/src/lib/boardGesture.ts');
const { boardViewPosition, squareFromBoardView } = await load('/src/lib/boardOrientation.ts');
const {
  BADGE_EDGE_MARGIN,
  BADGE_R,
  BOARD_SIZE,
  BadgeDisc,
  HlRing,
  LastMoveRect,
  badgeCenter,
  lastMoveSquares,
} = await load('/src/components/Board.tsx');
const {
  annotationColors,
  annotationInk,
  annotationMarkColors,
  tokens: boardTokens,
} = await load('/src/lib/tokens.ts');
const Chess = await load('/src/lib/chess.ts');

test('a gesture commits only what it previewed', async () => {
  const owner = { pointerId: 1, buttonBit: 1 };
  const moveCalls = [];
  const moveGesture = beginMoveGesture(owner, 'g1', new Set(['f3']), (from, to) =>
    moveCalls.push(`${from}-${to}`),
  );
  finishBoardGesture(moveGesture, 'e5'); // not a legal target
  finishBoardGesture(moveGesture, 'g1'); // released on the origin
  finishBoardGesture(moveGesture, null); // released off-board
  finishBoardGesture(moveGesture, 'f3');
  assert.deepEqual(moveCalls, ['g1-f3'], 'a move commits only onto a legal target');

  const annotationCalls = [];
  const annotationGesture = beginAnnotationGesture(
    owner,
    'c4',
    (from, to) => annotationCalls.push(`arrow:${from}-${to}`),
    (square) => annotationCalls.push(`highlight:${square}`),
  );
  finishBoardGesture(annotationGesture, null); // released off-board
  finishBoardGesture(annotationGesture, 'c4'); // same square: highlight
  finishBoardGesture(annotationGesture, 'f7'); // dragged away: arrow
  assert.deepEqual(annotationCalls, ['highlight:c4', 'arrow:c4-f7']);
});

test('board orientation is a reversible view transform', async () => {
  // Pieces, overlays, and pointer gestures all go through this transform, so
  // a lossy round trip would make them disagree after a flip.
  for (const orientation of ['white', 'black']) {
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const view = boardViewPosition(f, r, orientation);
        assert.equal(squareFromBoardView(view.x, view.y, orientation), Chess.idxToSq(f, r));
      }
    }
  }
  // Which square is the top-left cell in each perspective. The inverse
  // (`squareFromBoardView(0, 0, …)`) needs no anchor of its own: the round trip
  // closes it at f=0,r=7 and f=7,r=0.
  assert.deepEqual(boardViewPosition(0, 7, 'white'), { x: 0, y: 0 });
  assert.deepEqual(boardViewPosition(7, 0, 'black'), { x: 0, y: 0 });
});

test('the hl ring and the last-move flood differ in form', async () => {
  // Kind is never color alone. The rare, aimed `hl` takes the ring; the last
  // move, marked on every move, keeps the flood so it does not box every frame.
  assert.ok(boardTokens.boardLastMoveOnDark, 'the last move keeps its flood tokens');
  // A translucent stroke takes on the square under it; opaque keeps one token
  // instead of a per-square alpha pair.
  assert.match(
    boardTokens.boardHighlightRing,
    /^#[0-9a-f]{6}$/i,
    'the `hl` ring is an opaque stroke, so it does not take on the square under it',
  );
  assert.equal(
    boardTokens.boardHighlight,
    undefined,
    'the old flood token is gone, so nothing can quietly re-flood `hl`',
  );
  // Read from the element `LastMoveRect` returns, not Board.tsx source text,
  // which fails open on a local rename.
  const { stroke, strokeWidth, fill, x, y, width, height, opacity } = LastMoveRect({
    view: { x: 3, y: 2 },
    fill: '#abcdef',
    opacity: 0.5,
  }).props;
  assert.deepEqual(
    { stroke, strokeWidth, fill, x, y, width, height, opacity },
    {
      stroke: undefined,
      strokeWidth: undefined,
      fill: '#abcdef',
      x: 300,
      y: 200,
      width: 100,
      height: 100,
      opacity: 0.5,
    },
    'the last move takes no stroke or ring by any name — it stays a flood of the whole square it was handed (a ring on every move is visual noise) and ages out by fading at the opacity it was handed',
  );
  // e2 (light) → e5 (dark), so the pair also pins the per-square amber stops;
  // a single flood value for both would pass a same-color move.
  const plain = { fromF: 4, fromR: 1, toF: 4, toR: 4, t: 0 };
  assert.deepEqual(
    lastMoveSquares(plain).map((sq) => sq.fill),
    [boardTokens.boardLastMoveOnLight, boardTokens.boardLastMoveOnDark],
    'an unannotated move is amber on both squares, per-square alpha unchanged',
  );
  const judged = lastMoveSquares({ ...plain, annotation: 'blunder' });
  assert.equal(
    judged[0].fill,
    boardTokens.boardLastMoveOnLight,
    'the origin square keeps the amber, so a move still reads directionally',
  );
  assert.equal(
    judged[1].fill,
    annotationColors.blunder,
    'the landing square carries the judgment',
  );
  assert.ok(
    judged[1].alpha > 0 && judged[1].alpha < 1,
    'the judgment is a tint over the square, not a repaint of it',
  );
  // The live overlay and the gesture preview both render through `HlRing`;
  // a passthrough props bag would let a call site override the geometry.
  const ring = HlRing({ view: { x: 0, y: 0 } }).props;
  assert.equal(ring.fill, 'none', 'the ring is a stroke, never a flood');
  assert.equal(ring.stroke, boardTokens.boardHighlightRing);
  assert.ok(ring.r > 0 && ring.r < 50, 'the ring stays inside its square');
  assert.deepEqual([ring.cx, ring.cy], [50, 50], 'the ring centers on its square');
  assert.deepEqual(
    HlRing({ view: { x: 3, y: 2 } }).props,
    { ...ring, cx: 350, cy: 250 },
    'only the center moves with the square — one pen, one radius, everywhere',
  );
  // The optional props may move the ring's opacity and its growth, and
  // nothing else. A call site cannot reach the pen.
  const scaled = HlRing({ view: { x: 0, y: 0 }, opacity: 0.5, scale: 2 }).props;
  assert.deepEqual(
    { ...scaled, opacity: ring.opacity, transform: ring.transform },
    ring,
    'opacity and scale are the only things a call site can vary',
  );
  assert.match(
    scaled.transform,
    /^translate\(50 50\) scale\(2\) translate\(-50 -50\)$/,
    'growth pivots on the ring’s own center, not the square’s origin',
  );
});

test('move-quality marks: chrome contrast, a rimless disc, and the corner clamp', async () => {
  // Two color tables, because the board and the panel are different grounds;
  // TypeScript's `Record<MoveAnnotation, string>` already keeps both exhaustive.
  const channel = (c) => {
    const n = c / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return (
      0.2126 * channel((n >> 16) & 255) +
      0.7152 * channel((n >> 8) & 255) +
      0.0722 * channel(n & 255)
    );
  };
  const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  // A broken ratio function passes every floor by inventing large numbers, so
  // pin two spec-fixed pairs; the max alone would pass a degenerate function.
  assert.equal(contrast('#ffffff', '#000000').toFixed(2), '21.00');
  assert.equal(contrast('#ffffff', '#777777').toFixed(2), '4.48');

  // The move list is chrome and holds body AA, the floor the board badge gives
  // up. Checked on every backdrop a mark renders on; the lighter variation
  // inset fails first.
  const CHROME_BACKDROPS = {
    'panel well': '#283045',
    'variation inset': '#31384c',
  };
  for (const [where, backdrop] of Object.entries(CHROME_BACKDROPS)) {
    for (const [quality, hex] of Object.entries(annotationMarkColors)) {
      const ratio = contrast(backdrop, hex);
      assert.ok(
        ratio >= 4.5,
        `${quality}'s mark is 13px/700 body text and holds AA on the ${where} (${ratio.toFixed(2)}:1)`,
      );
    }
  }

  const cssColor = (rule, property) => {
    const token = rule.match(new RegExp(`${property}:\\s*var\\((--[\\w-]+)\\)`))?.[1];
    const hex = bareStyles.match(new RegExp(`${token}:\\s*(#[a-fA-F0-9]{6})`))?.[1];
    assert.ok(hex, `${property} resolves to a palette color`);
    return hex;
  };
  for (const selector of ['.present-mv.current', ".present-toggle[aria-pressed='true']"]) {
    const rule = cssRule(selector);
    assert.ok(contrast(cssColor(rule, 'background'), cssColor(rule, 'color')) >= 4.5,
      `${selector} holds body-text contrast while active`);
  }

  // The board badge knowingly sits under the 3:1 large-text floor for some
  // qualities, so no contrast floor is asserted for it; the rimless disc is,
  // via the element `BadgeDisc` returns.
  {
    const { stroke, strokeWidth, fill, cx, cy, r } = BadgeDisc({
      annotation: 'great',
      cx: 100,
      cy: 200,
    }).props;
    assert.deepEqual(
      { stroke, strokeWidth, fill, cx, cy, r },
      {
        stroke: undefined,
        strokeWidth: undefined,
        fill: annotationColors.great,
        cx: 100,
        cy: 200,
        r: BADGE_R,
      },
      'the disc has no rim by any name and is filled with its quality’s color',
    );
  }
  assert.equal(annotationInk, '#ffffff', 'the badge glyph is white, as in the reference');

  // The badge hangs off its square's top-right corner, outside the viewBox on
  // the h-file and 8th rank; the PNG export rasterizes that box, so it must clamp.
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 8; y++) {
      const [cx, cy] = badgeCenter({ x, y });
      for (const [axis, v] of [['x', cx], ['y', cy]]) {
        assert.ok(
          v - BADGE_R >= 0 && v + BADGE_R <= BOARD_SIZE,
          `the badge on view cell ${x},${y} stays on the board (${axis}=${v})`,
        );
      }
    }
  }
  // A clamp that swallows the overhang everywhere also stays on the board, so
  // pin the corner too. Interior squares get the corner itself…
  assert.deepEqual(
    badgeCenter({ x: 3, y: 3 }),
    [400, 300],
    'an interior badge centers on its square’s corner rather than inside it',
  );
  // …and an edge square the closest point the board permits: one radius plus
  // the margin in, stated in tokens so a retuned margin still passes.
  assert.deepEqual(
    badgeCenter({ x: 7, y: 0 }),
    [BOARD_SIZE - BADGE_R - BADGE_EDGE_MARGIN, BADGE_R + BADGE_EDGE_MARGIN],
    'a corner badge sits as close to its corner as the viewBox allows',
  );
});
