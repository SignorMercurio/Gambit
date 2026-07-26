# AGENTS.md

Guidance for agents working in this repository.

## Project

Gambit is a Vite + React chess timeline renderer for teachers and content creators. The product goal is a deterministic, recordable chess board driven by a small timestamped script. The board is the artifact; the surrounding chrome should stay quiet, precise, and suitable for screen recording.

Read these before broad UI work:
- `PRODUCT.md` for product intent and anti-references.
- `DESIGN.md` for design tokens, component rules, and visual vocabulary.

## Commands

Use these as the normal verification gates:

```sh
npm test
npm run typecheck
npm run build
```

For local visual QA:

```sh
npm run dev
```

The dev server is usually Vite on `http://127.0.0.1:5173/`, but use the URL Vite prints if the port is busy.

## Code Map

- `src/App.tsx`: app orchestration, script state, playback clock, event snapshots, two-page side panel (Script editor / Setup with FEN, subtitles, narration), controls, and present mode (a distraction-free recording view).
- `src/components/PresentationMoves.tsx`: read-only mainline PGN for present mode. Deliberately shows only numbered mainline moves + the current position — no variations, move-quality annotations, timestamps, seek dots, or edit affordances. A passive readout keyed off `reachedEventIndex`, memoized; never the editor `MoveList` with a flag.
- `src/components/Board.tsx`: board rendering, pieces, highlights, arrows, coordinates, capture flash, annotation badges, editing gesture layer.
- `src/components/MoveList.tsx`: PGN-style move list — numbered mainline rows, inset variation flows, kind-colored seek dots. The Script tab's Moves view: a structured editor with per-event time chips, deletes, and whole-variation delete; auto-follows the playhead only while playback runs. Memoized — the parent re-renders per animation frame, so past/current state derives from `reachedEventIndex`, never from the raw clock.
- `src/components/Piece.tsx`: piece image mapping.
- `src/components/useRovingTabIndex.ts`: shared roving-tabindex hook (WAI-ARIA toolbar pattern) used by the timeline pin row and the Moves-view list — one Tab stop per group, arrows walk controls, imperative tabIndex so arrow presses never re-render the subtree.
- `src/lib/chess.ts`: minimal chess state engine, legal move generation, SAN parsing and serialization.
- `src/lib/boardGesture.ts`: pure in-flight gesture state that captures move/arrow/highlight commit callbacks at pointer-down so playback cannot change the position or playhead used at pointer-up.
- `src/lib/subtitles.ts`: SRT subtitle parsing and cue validation.
- `src/lib/timeline.ts`: timestamped script parsing. Short syntax is primary: `hl`, direct arrows like `f3->e5`, `cl`, `rs`, `st`, `br`, `ml`, `mind`, `reveal`; legacy long commands remain accepted. Also home of the playhead→event-index rule (`lastEventIndexAt`).
- `src/lib/scriptEdit.ts`: gesture-to-script text writer — timestamp formatting, collision stepping, time-sorted line insertion that preserves comments and formatting — plus the pure gesture planners (`planLineInsert`, `planMoveGesture`): branch-aware move policy that returns new script text and landing boundaries, leaving the React commit to `App`.
- `src/lib/tokens.ts`: JS/SVG-facing design tokens mirrored from CSS.
- `src/styles.css`: visual system and responsive layout.
- `public/pieces/*.svg`: Staunty chess pieces from Lichess.

## Engineering Rules

- Keep the app deterministic. Script text, Start FEN, and current time should fully determine the board.
- Prefer small, local changes. Avoid introducing state managers, chess libraries, router layers, or new dependencies unless the feature genuinely needs them.
- Preserve strict TypeScript cleanliness. `npm run typecheck` must pass.
- When changing parser behavior, return visible `TimelineEvent` errors rather than silently ignoring malformed script input.
- When changing subtitle behavior, keep SRT input independent from the chess script and surface malformed cues as visible errors.
- Narration audio is session-only (object URL, no persistence) and independent from the script and subtitles. The playback clock stays the source of truth: the audio element follows play/pause/seek/rate and never drives the board; narration that outlasts the script extends playback duration like subtitle cues.
- When changing chess behavior, add conservative validation rather than accepting ambiguous or typo-like SAN.
- Board gestures (Script tab only) are an input method for the script, not a second state channel: left-drag records a SAN move (legal moves only), right-drag records an arrow, right-click records a highlight — each captures its commit callback and playhead at pointer-down, then is written via `src/lib/scriptEdit.ts`, capped strictly before the next scripted event and floored strictly after the previous one so a stamp never slides onto a position the board didn't preview (off-grid timestamps make grid rounding ambiguous — a pinched interval is a visible conflict, never a reorder). Arrows and highlights always write exactly one line; a move writes one line, or three when it wraps itself in a `br`/`ml` variation (next rule). Reject the gesture if the script text changes before pointer-up, and if no free 0.1s slot exists show a visible edit conflict; both paths leave the script unchanged. A gesture belongs to the pointer and button that started it: other pointers (a stray touch) and chorded buttons must not retarget, commit, or cancel it, and an uncaptured off-board release cancels rather than dangles. The pause-landing rule reads the transport state at release, not the pointer-down snapshot — playback flipping mid-drag must not park a paused board exactly on an event's timestamp. Gestures must never mutate board state directly; the script text stays the single source of truth, and generated lines must round-trip through `parseScript` unchanged.
- Move gestures are branch-aware, lichess-style: replaying the scripted next move only advances the playhead; a different move played before later moves wraps itself in an auto-generated `br`/`ml` variation (the move stamps on the playhead — that is the instant the narration means — and `br` tucks into a free slot just before it); a move while a variation is open extends it, pushing the variation's `ml` later when needed (the one sanctioned rewrite of an existing line). When the structure cannot fit before the next event, fall back to a plain insert so the conflict surfaces as visible script errors — never silently reorder or delete the author's lines.
- The Script panel's Moves view is a structured editor over the same script text, never a second model: time edits and deletes are text transforms in `src/lib/scriptEdit.ts` (`setLineTime` rewrites in place when chronological order is kept and relocates the line when it crosses other events; `removeLines` deletes exact lines, leaving comments in place). Times are free-form by design — structural damage surfaces as visible errors and is one-step undoable. The Text view is the fallback surface for comments and exotic edits and must always remain available.
- Keep board coordinates, arrows, highlights, badges, and pieces in predictable stacking order. Coordinates must remain readable with enlarged pieces.
- Do not expose FEN or internal board metadata in the default user-facing playback surface unless the user explicitly asks for it.

## Design Rules

- This is a product tool, not a landing page. Do not add marketing sections, hero copy, decorative cards, or generic SaaS dashboard patterns.
- The board is the visual priority. Chrome should not compete with the board in a recording.
- Preserve the current color vocabulary: blue for moves, amber for highlights, persimmon for arrows, neutral for structural events, vermillion for errors/resets.
- Arrows and highlights must survive downscaled video. Test at the real board size, not just in code.
- Use stable dimensions for board overlays and transport controls so playback does not shift layout.
- Keep the recording artifact at 720px on ordinary 800–900px-tall laptop viewports; only genuinely short desktop viewports (height ≤760px) may use the 560px working fallback. Prefer page scroll over silently shrinking a normal recording frame into the 500px range. This is an authored invariant guarded by `scripts/test-regressions.mjs`: `--artifact-fit-width` must never be redefined with a `100dvh` shrink formula — not in the base, the media queries, or present mode. New surfaces inherit the fixed authored size.
- Present mode (`app--present`) is a distraction-free recording/presentation view: it hides the header, side panel, and footer, floats the transport as an auto-hiding bar (fades with the cursor after the pointer idles during playback), and optionally shows the read-only `PresentationMoves` panel. It is purely a view layer — board gestures turn off (`interactive` is false) and the board stays fully determined by script + FEN + time, identical to edit mode at the same timestamp. Present must not become a second state channel.
- Respect `prefers-reduced-motion`: decorative motion should reduce; functional piece movement can remain.

## Chess And Timeline Pitfalls

- SAN capture markers must match the resolved move. `Nxe5` should not resolve to quiet `Ne5`, and quiet SAN should not hide a capture.
- Timestamp parsing must never produce `NaN`; invalid timestamps should become script errors.
- Highlight and arrow square inputs should be validated before reaching `Board`.
- If script duration shrinks, clamp the current playback time to the new duration.
- `reset` should restore the configured Start FEN; `start` should restore the standard initial chess position. Both clear transient visuals such as capture flash, arrows, highlights, and last move.
- Branch/mainline snapshots should restore board state and overlays without mutating prior snapshots.
- `br`'s timestamp is ordering-only: it renders nothing, so any value between the neighboring events is equivalent. `ml`'s timestamp is meaningful — it is the visible moment the board snaps back to the main line. UI should let users edit `ml` times but not surface `br` times as editable.
- Mind's-eye mode (`mind` … `reveal`) renders the narrator's mental sketch: the board sinks into a near-black void (grid nearly invisible, coordinates swap to a bright ink and stay fully legible) and only squares the script has named show pieces — a move names its from/to squares, the captured square, the castling rook's path, and the checked king; `hl` and arrows name their squares. Named pieces fade from full strength to nothing on a forgetting curve — what isn't restated is forgotten — except rehearsed squares, which hold at full strength: the move currently on the board (held until the next move takes over, since the gap between moves outlasts the curve and the narration is still on that move) and squares under a currently-visible highlight or live check (arrows render but hold no pieces). Rehearsal that ends at an event is released — the squares are named again at that instant, so they forget from there rather than popping out: the outgoing move when the next one takes over, a pinned highlight when `cl` clears it, the checked king when a move answers the check. An unpinned highlight expires between events, where the walk has no instant to name, but it only ever holds a piece for its own 2.5s. `rs`/`st`/`fen` empty the sketch while staying dark; `reveal` lifts the mode with a deterministic fade-in. The whole thing is derived state (events + time): the touch map and the held set are computed in the snapshot walk, so br/ml restores them like any other board state, and the void's depth is a clock-derived layer opacity rather than a CSS transition — script + FEN + time fully determine every frame, including mid-sink ones.
- Subtitle cues should extend playback duration when they outlast the chess script and render below the board, never over it.
- Event-anchored seeks must not land exactly on the event's timestamp while paused: every timed visual derives from `time - event.t`, so at age 0 the moved piece, highlight, and arrow are all invisible. Land just past the event (the `seekEvent` helper: +0.5s, clamped before the next event), the same convention gesture inserts use.

## Assets And Licensing

The chess pieces in `public/pieces/` are the Staunty set from Lichess by sadsnake1 under CC BY-NC-SA 4.0. Keep `LICENSE-pieces.txt`, `README.md`, and the footer attribution in sync if piece assets change.

## Review Checklist

Before handing off meaningful changes:

1. Run `npm test`.
2. Run `npm run typecheck`.
3. Run `npm run build`.
4. For visual changes, refresh the local app and inspect the board at normal viewport size.
5. For parser or chess changes, test at least one valid input and one malformed input path.
6. Check that no unrelated generated files or `dist/` artifacts are included unless the user explicitly asked for them.
