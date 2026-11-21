# Verification

## Gates

```sh
npm test
npm run build
```

`npm run build` typechecks (`tsc -b`, including `vite.config.ts`) before bundling, so
there is no separate typecheck gate.

`npm test` is `node --test "test/*.test.mjs"`: `node:test`, no third-party framework,
one file per module, one rule per test name.

- `test/support.mjs` starts an in-process Vite server and `load()`s the real modules,
  so the suite tests source rather than a build. It also holds the fixtures more than
  one file uses.
- `test/css.mjs` reads `src/styles.css` as comment-stripped source text for the layout
  guards in `test/styles.test.mjs`.
- Run one file with `node --test test/world.test.mjs`, or a subset with
  `node --test --test-name-pattern=<regex> "test/*.test.mjs"`.

Add a test to the file named for the module it exercises. Name it for the rule, so a
failure reads as the rule that broke.

## Relations The Suite Holds

Beyond behavior coverage, these tests hold relations no single file can enforce on its
own. When a change breaks one, fix the relation — do not relax the assertion.

| Relation | Test |
|---|---|
| A new event kind cannot reach the parser while staying out of the catalogue or `markerColors` | `every parser kind is in the catalogue` (commands) |
| The rendered `SYNTAX_HINT` names every catalogued command exactly once | `the syntax hint names every kind exactly once` (commands) |
| Two kinds sharing a color differ in form, unless they are halves of one gesture or the reset family | `two kinds that share a color differ in form` (commands) |
| The in-flight gesture preview carries `BOARD_GESTURE_CLASS`, the class a PNG snapshot removes | `the gesture preview carries the class a snapshot removes` (board-export) |
| `--artifact-fit-width` is the authored token or a literal size in every tier | `the recording frame is an authored size, never viewport-derived` (styles) |
| `--subtitle-cue-size` and `--subtitle-track-height` are declared together and the cue fits its track | `the subtitle track fits its cue in every media tier` (styles) |
| Editor controls keep the 24px hit floor | `editor controls keep the 24px hit floor` (styles) |
| The smallest type clears 4.5:1 on its worst backdrop | `time chips keep their contrast on the variation inset` (styles) |
| A catalogued command word never falls through to SAN | `every catalogued word selects its own command, never SAN` (commands) |
| br/ml depth is counted once, by the walk | `each snapshot knows how many variations are open` (world) |

## Before Handing Off

1. Select gates by the change: behavior changes use `npm test`; type or bundle
   changes use `npm run build`; broad changes and release readiness use both.
   Documentation-only changes need `git diff --check` and affected references.
   Do not repeat passing gates unless their inputs change or a concern remains.
2. For visual changes, refresh the local app and inspect the board at normal viewport size.
3. For parser or chess changes, test at least one valid input and one malformed input path.
