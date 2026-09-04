# Verification

## Gates

```sh
npm test
npm run typecheck
npm run build
```

`npm run typecheck` is the fast local subset of `npm run build`'s `tsc -b`, which also
typechecks `vite.config.ts` — so CI runs `npm test` and `npm run build` only.

`npm test` is `node scripts/test-regressions.mjs` — one hand-written assert script, not
a test framework. It spins up an in-process Vite server and imports the real modules, so
it tests source rather than a build, and it additionally asserts against `src/styles.css`
as source text and against rendered elements.

## What The Suite Guards

Beyond ordinary behavior coverage, it holds the *relations* that no single file can
enforce on its own. These are why several rules in these docs are checkable rather than
merely stated:

- The command catalogue (`src/lib/commands.ts`) is chained to `markerColors`, so a new
  event kind cannot reach the parser while staying invisible in the UI.
- The rendered `SYNTAX_HINT` element names every catalogued command exactly once —
  asserted against the element a reader actually sees, not against `SYNTAX_GROUPS`.
- `markerColors` and `markerForms`: two kinds sharing a color must not share a form,
  unless they are two halves of one gesture or the reset family.
- `--artifact-fit-width` is never redefined with a `100dvh` shrink formula, in any tier.
- `--subtitle-cue-size` and `--subtitle-track-height` are declared together in every
  `:root` that redefines either.
- Editor controls keep the 24px floor; the smallest type clears 4.5:1 on its worst backdrop.

When a change breaks one of these, fix the relation — do not relax the assertion.

## Before Handing Off

1. Run the three gates above.
2. For visual changes, refresh the local app and inspect the board at normal viewport size.
3. For parser or chess changes, test at least one valid input and one malformed input path.
