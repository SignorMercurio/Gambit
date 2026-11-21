# Design Rules

The visual vocabulary lives in [DESIGN.md](../DESIGN.md) (palette, Five Meanings, typography, elevation, components, contrast and hit-target floors) and [PRODUCT.md](../PRODUCT.md) (intent, anti-references, sanctioned exceptions). Check both before treating a shipped color as a violation: the move-quality marks are a deliberate, spent carve-out from the chess.com anti-reference, not a precedent.

The governing constraint (PRODUCT.md principle 1): the board is the visual priority, and chrome that competes with it in a recording is a defect. These are the constraints that bind *code* rather than color.

- This is a product tool, not a landing page: no marketing sections, hero copy, decorative cards, or SaaS dashboard patterns.
- **Kind is never color alone.** Marks that share a hue differ in form (DESIGN.md §2 Board Marks, §5 Event-kind markers).
  - Pin and dot shape is data: `markerForms` in `src/lib/tokens.ts`, reaching CSS as `data-form`. Enforced by `two kinds that share a color differ in form` and `every marker form has a stylesheet rule` in `test/commands.test.mjs`.
  - Tune a same-hue pair against each other, and a mark on any square against *both* square colors.
  - `HlRing`, `BadgeDisc`, and `LastMoveRect` in `src/components/Board.tsx` own their marks and return the element, not a props bag, so `tsc` makes a second radius, a rim, or a stroke unrepresentable at a call site.
  - The live overlay and the gesture preview share `HlRing`, so a preview never promises a mark the script would not draw. Enforced by `the hl ring and the last-move flood differ in form` in `test/board.test.mjs`.
  - No guard reads TypeScript as text; `src/styles.css` is the one source-text surface (see [testing.md](testing.md)).
- **Board layers** stack in this order; a new layer declares its plane instead of landing wherever the DOM puts it. `BOARD_LAYER_Z` in `Board.tsx` is this table in code, and every layer takes its z from there; within one SVG, paint order is document order. The board's SVG `<defs>` live once, in the base SVG (ids are document-global). Coordinates must stay readable with enlarged pieces.

  | z | layer |
  |---|---|
  | base | squares → void → last-move flood → `hl` rings → check glow (one SVG) |
  | 1 | pieces (own stacking context; per-piece 1/4/5 stays contained) |
  | 3 | coordinates → arrows (one SVG), then the editor-only gesture preview |
  | 4 | capture flash |
  | 5 | move-quality badge |

  The gesture preview must carry the `board-gesture-overlay` class (`BOARD_GESTURE_CLASS`), which the PNG export removes from its clone. Enforced by `the gesture preview carries the class a snapshot removes` in `test/board-export.test.mjs`.
- Test arrows and highlights at the real board size, not in code review: they have to survive the downscale (PRODUCT.md principle 3).
- Use stable dimensions for board overlays and transport controls so playback never shifts layout. Conditional chrome (the gesture `Undo`) grows into reserved space and never displaces its neighbours. Enforced by `Undo grows into reserved space` in `test/styles.test.mjs`.
- Panel headings do not repeat the tab that owns them. Keep the `h2` as `sr-only` when something references it (`aria-labelledby`).
- **The recording frame is an authored size.** 720px on ordinary 800–900px-tall laptops; only short desktop viewports (height ≤760px) use the 560px fallback (tiers: DESIGN.md §1). Prefer page scroll over shrinking a recording frame.
  - `--artifact-fit-width` may only be the authored token or a literal size, in the base rule, every media query, and Present alike.
  - Any viewport-derived formula fails: `100dvh`, `100vh`, `90svh`, `clamp(400px, 90dvh, 720px)`, or indirection through another custom property holding one.
  - Enforced by `the recording frame is an authored size, never viewport-derived` and `breakpoint blocks keep the artifact on its authored track` in `test/styles.test.mjs`.
- **Present mode is a view layer, not a state channel.** `app--present` hides header, side panel, and footer, floats the auto-hiding transport, and optionally shows the read-only `PresentationMoves`. Board gestures turn off (`interactive` is false), and the board at a given time is identical to edit mode.
- Respect `prefers-reduced-motion`: decorative motion reduces; functional piece movement can remain.
- FEN belongs to the authoring surfaces (Setup's Start FEN field and the script's `fen` command). Never surface FEN or other internal board metadata on the board, the transport, or Present.
