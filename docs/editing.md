# Editing Surfaces

Board gestures, the Moves view, and the insert menu are input methods for the script
text — never a second state channel. Every one of them writes through
`src/lib/scriptEdit.ts`, and generated lines must round-trip through `parseScript`
unchanged. Gesture semantics that are really command semantics (`br`/`ml` timestamps,
what `rp` excludes) live in [script-language.md](script-language.md).

Text replacement invalidates any older pending import of the same type. Script
typing, structured edits, and Undo use the same replacement entry point;
subtitles follow the same rule so a slow file read cannot overwrite later edits.

Tests: `test/script-edit.test.mjs` (planners and text transforms),
`test/board.test.mjs` (gesture state), `test/move-lists.test.mjs` (Moves view outline).

## Board Gestures (Script Tab Only)

- Left-drag records a SAN move (legal moves only), right-drag an arrow, right-click a
  highlight. Arrows and highlights write exactly one line; a move writes one, or three
  when it wraps itself in a `br`/`ml` variation.
- Gestures never mutate board state directly; the script text stays the single source
  of truth.
- A gesture captures its commit callback and playhead at pointer-down. If the script
  text changes before pointer-up the gesture is rejected, and if no free 0.1s slot
  exists it is a visible edit conflict. Both leave the script unchanged.
- The stamp is capped strictly before the next scripted event and floored strictly
  after the previous one, so it never slides onto a position the board did not
  preview. A pinched interval is a visible conflict, never a reorder.
- A gesture belongs to the pointer and button that started it. Other pointers and
  chorded buttons never retarget, commit, or cancel it; an uncaptured off-board
  release cancels it.
- The pause-landing rule reads the transport state at release, not at pointer-down, so
  playback flipping mid-drag cannot park a paused board exactly on an event's
  timestamp.
- A gesture that cannot start says so. Squares that can move carry a resting `grab`
  cursor, and a left-press on a piece that cannot move yields an `EDIT` row naming the
  reason, in the same band the planners' conflicts use. Empty squares stay silent.

## Branch-Aware Moves

- Replaying the scripted next move only advances the playhead.
- A different move played before later moves wraps itself in a generated `br`/`ml`
  variation: the move stamps on the playhead, and `br` takes a free slot just before it.
- A move while a variation is open extends it, pushing the variation's `ml` later
  when needed — the one sanctioned rewrite of an existing line.
- If the wrap cannot fit completely before the next event, the gesture is rejected
  with a visible edit conflict. It never falls back to a plain mainline insert, a
  silent reorder, or deleting the author's lines.

## Moves View And Insert Menu

- The Moves view is a structured editor over the same script text, never a second
  model. Its structure is `buildMoveOutline` (`src/lib/moveOutline.ts`); `MoveList`
  only renders it.
- Time edits and deletes are text transforms in `src/lib/scriptEdit.ts`. `setLineTime`
  rewrites in place when chronological order is kept and relocates the line when it
  crosses other events. `removeLines` deletes exact lines and leaves comments in place.
- Times are free-form: structural damage surfaces as visible errors and is one-step
  undoable.
- The insert menu (`src/components/InsertMenu.tsx`) writes through `planLineInsert`,
  the board gestures' own planner, so stamping, collision stepping, and the
  paused-playhead landing are one policy.
- A command that needs an argument routes to the surface that can supply it (a board
  gesture, Setup, or Text) rather than inserting a template that parses as an error.
- The Text view is the fallback surface for comments and exotic edits and always
  remains available.
