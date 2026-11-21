// Guards read from `src/styles.css` as source text: layout invariants no
// single rule can hold on its own.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bareStyles, cssRules, cssRule, cssNum, cssLengths, styleRegions, mediaRegions, axis } from './css.mjs';


test('the recording frame is an authored size, never viewport-derived', async () => {
  assert.match(bareStyles, /--artifact-fit-width:\s*var\(--artifact-width\)/);
  assert.match(bareStyles, /@media \(max-width:\s*1240px\)/);
  // An allowlist over both artifact tokens (docs/design.md): banning `100dvh`
  // alone lets `100vh`, `90svh` and `clamp(…dvh…)` through, and checking only
  // the outer token misses a viewport-derived `--artifact-width`.
  const fitValues = [
    ...bareStyles.matchAll(/--artifact-(?:fit-)?width:\s*([^;]+);/g),
  ].map((m) => m[1].trim());
  assert.ok(fitValues.length >= 3, 'the artifact size is declared for the base and the 560px band');
  for (const value of fitValues) {
    assert.match(
      value,
      /^(var\(--artifact-width\)|\d+px)$/,
      'the recording frame is an authored size, never derived from the viewport',
    );
  }
});

test('breakpoint blocks keep the artifact on its authored track', async () => {
  // One brace-balanced block per query: a `@media …[\s\S]*?X` regex runs past
  // the closing brace and passes on a later tier's X.
  const mediaBlock = (query) => {
    const found = mediaRegions.filter((r) => r.query === `@media ${query}`);
    assert.equal(found.length, 1, `exactly one @media ${query} block`);
    return found[0].css;
  };
  const mediaRuleMatches = (query, selector, declaration, message) => {
    const rules = cssRules(selector, mediaBlock(query));
    assert.ok(rules.some((rule) => declaration.test(rule)), message);
  };

  assert.match(
    mediaBlock('(min-width: 1241px) and (max-width: 1380px)'),
    /grid-template-columns:\s*var\(--artifact-fit-width\) minmax\(0,\s*1fr\)/,
    'the intermediate two-column band flexes the panel, never the artifact',
  );
  assert.match(
    mediaBlock('(min-width: 1081px) and (max-height: 760px)'),
    /--artifact-fit-width:\s*560px/,
  );
  mediaRuleMatches(
    '(max-width: 760px)',
    '.app--present .controls',
    /display:\s*grid/,
    'present mode restores the mobile transport grid after its desktop flex override',
  );
  mediaRuleMatches(
    '(max-width: 760px)',
    '.app--present-pgn .main',
    /grid-template-columns:\s*minmax\(0,\s*var\(--artifact-fit-width\)\)/,
    'the phone PGN stacks instead of crushing the recording artifact beside a fixed panel',
  );
});

test('the subtitle track fits its cue in every media tier', async () => {
  // `conditions` returns null for a query it cannot express, so each caller
  // decides what that means rather than reading it as "matches everywhere".
  const FEATURE = /\((min|max)-(width|height):\s*(\d+)px\)/g;
  const conditions = (query) => {
    const parsed = [...query.matchAll(FEATURE)].map((m) => ({
      bound: m[1],
      axis: m[2],
      px: Number(m[3]),
    }));
    const modelled = query.replace(FEATURE, '').replace(/@media|and|\s/g, '');
    return modelled === '' ? parsed : null;
  };
  const matches = (conds, w, h) =>
    conds.every(({ bound, axis, px }) => {
      const v = axis === 'width' ? w : h;
      return bound === 'min' ? v >= px : v <= px;
    });
  const widths = axis('width');
  const heights = axis('height');
  // Stated here because the fit loop's trip count is fixed before it starts,
  // so a counter inside it could not fail.
  assert.ok(
    widths.length * heights.length > 100,
    'the breakpoint sample covers both ladders on both sides of every step',
  );

  // The track is `auto`: a one-line cue too big for its declared minimum grows
  // the row and shifts the transport the moment a subtitle appears.
  {
    // Resolved per viewport on the breakpoint grid, in source order, because
    // padding and tokens step on different ladders; a file-wide minimum would
    // miss a band where one ladder has stepped and the other has not.
    // A region is a tier iff it declares something the fit reads, so an
    // unrelated `prefers-reduced-motion` block need not be modellable.
    const READS =
      /(--subtitle-track-height|--subtitle-cue-size)\s*:|\.subtitle-strip[^{}]*\{[^}]*(padding[\w-]*|border-block|line-height)\s*:/;
    const tiers = [];
    for (const region of styleRegions) {
      if (!READS.test(region.css)) continue;
      const conds = region.query === null ? [] : conditions(region.query);
      assert.ok(
        conds,
        `${region.query} moves a number the subtitle fit reads, so this guard has to be able to place it`,
      );
      tiers.push({ conds, css: region.css, decls: new Map() });
    }
    assert.ok(tiers.length >= 5, 'the subtitle ladders are found across the sheet');

    // Parsed once per tier through `cssRules`, not re-scanned per grid point:
    // faster, and no second spelling of the rule scanner.
    const SELECTORS = [':root', '.subtitle-strip', '.subtitle-strip p'];
    const DECL = /(?:^|[;{])\s*([\w-]+)\s*:\s*([^;}]+)/g;
    for (const tier of tiers) {
      for (const selector of SELECTORS) {
        const entries = [];
        for (const rule of cssRules(selector, tier.css)) {
          for (const [, prop, value] of rule.slice(rule.indexOf('{')).matchAll(DECL)) {
            entries.push([prop, value.trim()]);
          }
        }
        tier.decls.set(selector, entries);
      }
    }

    const px = (v) => Number.parseFloat(v);
    const resolve = (w, h, selector, prop) => {
      let value = null;
      for (const tier of tiers) {
        if (!matches(tier.conds, w, h)) continue;
        for (const [p, v] of tier.decls.get(selector)) if (p === prop) value = v;
      }
      return value;
    };

    // `padding`, `padding-block` and the two longhands all write the same two
    // numbers, so any legal spelling must resolve, in declaration order.
    const blockPadding = (w, h) => {
      let top = null;
      let bottom = null;
      for (const tier of tiers) {
        if (!matches(tier.conds, w, h)) continue;
        for (const [prop, value] of tier.decls.get('.subtitle-strip')) {
          const parts = value.split(/\s+/).map(px);
          if (prop === 'padding') [top, bottom] = [parts[0], parts[2] ?? parts[0]];
          else if (prop === 'padding-block') [top, bottom] = [parts[0], parts[1] ?? parts[0]];
          else if (prop === 'padding-top') top = parts[0];
          else if (prop === 'padding-bottom') bottom = parts[0];
        }
      }
      assert.ok(
        top !== null && bottom !== null,
        `the subtitle strip declares its block padding (unresolved at ${w}x${h})`,
      );
      return [top, bottom];
    };


    for (const w of widths) {
      for (const h of heights) {
        const track = px(resolve(w, h, ':root', '--subtitle-track-height'));
        const cue = px(resolve(w, h, ':root', '--subtitle-cue-size'));
        const lh = px(resolve(w, h, '.subtitle-strip p', 'line-height'));
        const [padTop, padBottom] = blockPadding(w, h);
        // The 2px `border-block` is part of the border-box the track measures.
        const border = px(resolve(w, h, '.subtitle-strip', 'border-block')) * 2;
        const needed = cue * lh + padTop + padBottom + border;
        assert.ok(
          needed <= track,
          `at ${w}x${h} a one-line ${cue}px cue needs ${needed.toFixed(2)}px and the track declares ${track}px`,
        );
      }
    }

    // Every `:root` that redefines either token redefines both: cue and track
    // are one colocated pair per tier.
    const roots = cssRules(':root');
    const pairs = roots
      .filter((r) => /--subtitle-(track-height|cue-size)/.test(r))
      .map((r) => ({
        track: cssNum(r, '--subtitle-track-height'),
        cue: cssNum(r, '--subtitle-cue-size'),
      }));
    assert.ok(pairs.length >= 4, 'every subtitle tier declares its pair');

    // Below ~3% of the composed frame the cue does not survive the export
    // downscale. The frame is derived from the tokens, not restated.
    const base = pairs[0];
    const artifact = cssNum(cssRule(':root'), '--artifact-width');
    const seam = cssNum(cssRule(':root'), '--board-seam');
    const frame = artifact + base.track - seam;
    assert.ok(
      base.cue / frame >= 0.03,
      `the cue holds a caption-scale share of the ${frame}px frame`,
    );

    // On the 560px frame the base cue would wrap and double the track. Found by
    // its artifact size, not its query text: whichever tier shrinks the board
    // also shrinks the cue.
    const shortDesktop = roots.find((r) => /--artifact-fit-width:\s*560px/.test(r));
    assert.ok(shortDesktop, 'the 560px band declares its own artifact size');
    assert.ok(
      cssNum(shortDesktop, '--subtitle-cue-size') < base.cue,
      'the 560px frame scales its cue down with the artifact',
    );
    // The 560 band overlaps the taller height tiers and media queries add no
    // specificity, so only source order lets its smaller pair win. Checked by
    // position in the block list; an `indexOf` on query text fails open at -1.
    const bandAt = mediaRegions.findIndex((r) => /--artifact-fit-width:\s*560px/.test(r.css));
    assert.notEqual(bandAt, -1, 'the 560px band is a top-level media block');
    const bandConds = conditions(mediaRegions[bandAt].query);
    assert.ok(bandConds, 'the 560px band states itself in width/height terms');
    const COUPLED = /--(artifact-fit-width|subtitle-cue-size|subtitle-track-height)\s*:/;
    // "Can co-apply" is answered by the evaluator, not by reading query text:
    // a later block may redeclare the pair only if no viewport satisfies both.
    for (const [i, region] of mediaRegions.entries()) {
      if (i <= bandAt || !COUPLED.test(region.css)) continue;
      const conds = conditions(region.query);
      assert.ok(
        conds,
        `${region.query} redeclares the coupled tokens after the 560px band, so this guard has to be able to place it`,
      );
      const overlap = widths.some((w) =>
        heights.some((h) => matches(bandConds, w, h) && matches(conds, w, h)),
      );
      assert.ok(
        !overlap,
        `${region.query} is declared after the 560px band and can co-apply with it, so it would override the band's artifact/cue pair`,
      );
    }
  }
});

test('present mode centers the artifact above its floating bar', async () => {
  // Present hides the header, panel, and footer and fixes the transport, so
  // the artifact is `.app`'s only in-flow child.
  const present = cssRule('.app--present');
  assert.match(present, /min-height:\s*100dvh/, 'present fills the viewport it centers in');
  // Plain `center` overflows both ways on a short window and puts the board's
  // top edge above the scroll origin, out of reach.
  assert.match(
    present,
    /justify-content:\s*safe center/,
    'centering degrades to top-aligned rather than pushing the board out of reach',
  );
  // Without the reserve, centering on the bare viewport slides the artifact
  // under the fixed bar.
  assert.match(
    present,
    /padding-bottom:\s*var\(--present-bar-reserve\)/,
    'the floating transport keeps a reserved footprint',
  );
  // Wherever the bar goes in flow the reserve drops to 0. Checked per query
  // block: global tallies pass when one tier un-floats the bar and another
  // drops the reserve.
  const unfloated = mediaRegions.filter((r) =>
    /\.app--present \.controls \{[^}]*position:\s*static/.test(r.css),
  );
  assert.ok(unfloated.length >= 2, 'the bar goes in flow on narrow and on short viewports');
  for (const region of unfloated) {
    assert.match(
      region.css,
      /\.app--present\s*\{[^}]*--present-bar-reserve:\s*0/,
      `${region.query} un-floats the bar without dropping its reserve`,
    );
  }
  // The artifact keeps its authored size in present mode.
  assert.doesNotMatch(present, /--artifact-fit-width/);
});

test('the scrub thumb sits on the rail', async () => {
  // A thumb above the rail lands in the pin row, where marker hit extensions
  // sit over the scrub input and take the press. The geometry is re-derived
  // from the tokens so a row-height or gap edit fails here.
  {
    const root = cssRule(':root');
    const pinRow = cssNum(root, '--tl-pin-row');
    const rail = cssNum(root, '--tl-rail');
    const gap = cssNum(root, '--tl-row-gap');
    const padTop = cssNum(root, '--tl-pad-top');
    const thumb = cssRule('.playhead-thumb');
    const thumbSize = cssNum(thumb, 'height');
    // No `--tl-crown` term: marker geometry is measured from the timeline's top,
    // while the thumb's `top:` is measured from the playhead, one crown higher.
    const railCenter = padTop + pinRow + gap + rail / 2;

    // Assert the calc() derivation, not the sum: a hand-summed literal is
    // correct only until a row height changes.
    const top = thumb.match(/top:\s*calc\(([\s\S]*?)\);/);
    assert.ok(top, 'the scrub thumb derives its offset instead of hardcoding it');
    for (const name of ['tl-crown', 'tl-pad-top', 'tl-pin-row', 'tl-row-gap', 'tl-rail']) {
      assert.ok(
        top[1].includes(`var(--${name})`),
        `the thumb offset accounts for --${name}`,
      );
    }
    // The grid it is derived from must be the grid that is actually drawn.
    assert.match(
      cssRule('.timeline'),
      /grid-template-rows:\s*var\(--tl-pin-row\) var\(--tl-rail\)/,
      'the ruler rows and the thumb offset read the same tokens',
    );

    // The thumb overhangs the rail, so the pin's hit extension must stop above
    // the thumb, not just the rail.
    const markerBottom = padTop + (pinRow + cssNum(cssRule('.marker'), 'height')) / 2;
    const [, , insetBottom] = cssLengths(cssRule('.marker::before'), 'inset');
    assert.ok(
      markerBottom - insetBottom <= railCenter - thumbSize / 2,
      'a pin hit target never covers the scrub thumb it sits above',
    );
    // The strand's own top is the same crown, so the thumb's offset is
    // measured from where the playhead actually starts.
    assert.match(
      cssRule('.playhead'),
      /top:\s*calc\(-1 \* var\(--tl-crown\)\)/,
      'the playhead strand and the thumb share one crown',
    );
  }
});

test('time chips keep their contrast on the variation inset', async () => {
  // The variation inset is the lighter of the chip's two backdrops, so any
  // opacity fade breaks the 4.5:1 body floor there first.
  assert.doesNotMatch(
    bareStyles,
    /\.pgn-time-edit\s*\{[^}]*opacity:/,
    'the time chip earns its quiet from its token and size, never a contrast-eating fade',
  );
});

test('editor controls keep the 24px hit floor', async () => {
  // WCAG 2.5.8 via transparent ::before extensions, so the visible pills stay
  // small. Each must grow outward (no inset positive, one negative). Three are
  // sized by font metrics, so this pins the mechanism, not the number.
  const HIT_EXTENSIONS = ['.pgn-mv', '.pgn-ret', '.pgn-time-edit', '.pgn-x'];
  for (const sel of HIT_EXTENSIONS) {
    // `[^{]*` spans a grouped selector — .pgn-mv::before shares its rule.
    const rule = bareStyles.match(
      new RegExp(`\\${sel}::before[^{]*\\{[^}]*\\}`),
    );
    assert.ok(rule, `${sel} keeps a hit-area extension to the 24px floor`);
    const inset = cssLengths(rule[0], 'inset');
    assert.ok(
      inset.every((v) => v <= 0) && inset.some((v) => v < 0),
      `${sel}'s hit extension grows its target outward (found inset: ${inset.join(' ')})`,
    );
  }
  {
    // `.pgn-x` is a declared 16px box, so its target is arithmetic, not a
    // measurement: 16 + 5 + 5 either side.
    const x = cssRule('.pgn-x', 'width');
    const [pad] = cssLengths(cssRule('.pgn-x::before'), 'inset');
    for (const axis of ['width', 'height']) {
      assert.ok(
        cssNum(x, axis) - 2 * pad >= 24,
        `the row × clears the 24px floor on ${axis}`,
      );
    }
  }
  {
    // The toggle's height is declared, so its vertical target is arithmetic.
    // Pinned at the transport's 44px, not `>= 24`: the bare button already
    // clears 24, so that would pass with the extension deleted.
    const mute = cssRule('.mute-btn', 'height');
    const [padBlock, padInline] = cssLengths(cssRule('.mute-btn::before'), 'inset');
    assert.ok(
      padBlock < 0 && padInline <= 0,
      `the move-sound toggle's hit extension grows its target outward (found inset: ${padBlock} ${padInline})`,
    );
    assert.equal(
      cssNum(mute, 'height') - 2 * padBlock,
      44,
      'the move-sound toggle reaches the transport\'s 44px hit convention',
    );
    // Its pressed state is the shared segmented one; `.present-toggle`'s
    // pressed fill fails 4.5:1 against the same chalk, and a standalone rule
    // here is how this control would pick it up.
    assert.equal(
      cssRules(`.mute-btn[aria-pressed='true']`).length,
      1,
      'the move-sound toggle has exactly one pressed rule',
    );
    assert.match(
      bareStyles,
      /\.speed-btn\[aria-pressed='true'\],[^{]*\.mute-btn\[aria-pressed='true'\]\s*\{[^}]*background:\s*var\(--tonal-white-12\)/,
      'it shares the segmented pressed treatment rather than declaring its own fill',
    );
    // Each console child names its cell once; every tier redraws only the area
    // map. A map missing a named cell sends that child to an implicit track at
    // that tier only. Rate and sound share one wrapper, so one cell.
    assert.doesNotMatch(
      bareStyles,
      /\.speed-group\s*\{[^}]*grid-(?:row|column|area)/,
      'no tier places the rate selector itself; the transport-prefs wrapper carries both',
    );
    const consoleCells = new Map(
      [...bareStyles.matchAll(/\.controls > \.([\w-]+)\s*\{\s*grid-area:\s*([\w-]+);\s*\}/g)]
        .map(([, child, area]) => [child, area]),
    );
    assert.equal(consoleCells.get('transport-prefs'), 'prefs', 'the prefs wrapper names its console cell');
    // Placing by line anywhere would route around the map this guard reads.
    assert.doesNotMatch(
      bareStyles,
      /\.(?:play-btn|ctrl-btn|time-readout|timeline|transport-prefs|present-controls)\s*\{[^}]*grid-(?:row|column)/,
      'console children are placed only by their named cell',
    );
    const consoleMaps = [...bareStyles.matchAll(/([^{}]*\.controls)\s*\{([^}]*)\}/g)]
      .filter(([, , body]) => /grid-template-(?:columns|areas)/.test(body));
    assert.ok(consoleMaps.length >= 4, 'every tier that lays out the console is found');
    for (const [, selector, body] of consoleMaps) {
      const map = body.match(/grid-template-areas:\s*([^;]+);/);
      assert.ok(map, `${selector.trim()} lays out the console, so it must redraw the area map`);
      const named = new Set(map[1].match(/[\w-]+/g));
      for (const [child, area] of consoleCells) {
        // Present's own controls render only in present mode.
        if (child === 'present-controls' && !selector.includes('.app--present')) continue;
        assert.ok(
          named.has(area),
          `${selector.trim()} lays out the console, so its map must name the ${child} cell`,
        );
      }
    }
  }
});

test('Undo grows into reserved space', async () => {
  // Undo appears the instant a board gesture lands; Import pinned right keeps
  // the row from moving under the cursor.
  assert.match(
    bareStyles,
    /\.panel-title-row \.import-btn\s*\{[^}]*margin-left:\s*auto/,
    'Import stays pinned right so a transient Undo cannot shove the row',
  );
});

test("the mind's-eye void is not a CSS fill swap", async () => {
  // Read from the comment-stripped text, so a comment may name the class.
  assert.doesNotMatch(
    bareStyles,
    /\.board--mind/,
    'mind mode must not re-grow a CSS fill swap — the void is derived from the clock',
  );
});
