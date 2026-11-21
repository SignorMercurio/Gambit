# Playback, Media, And Export

The playback clock is the source of truth. Subtitles and narration follow it and may
extend duration; neither drives the board.

## Clock And Duration

- The current time lives in one store, `src/lib/clock.ts`, not in React state. Only the
  board column follows it every frame (`useClockTime`); everything else subscribes to a
  derived primitive (`useClockValue`) or reads it at call time (`clock.get()`). A new
  surface that needs the time takes the clock, never a `time` prop from `App`.
- When script duration shrinks, clamp the current playback time to the new duration.
- A paused, event-anchored seek never lands exactly on the event's timestamp: every
  timed visual derives from `time - event.t`, so at age 0 the moved piece, highlight,
  and arrow are invisible. `seekEvent` lands 0.5s past the event, clamped before the
  next one (`landBetween` in `src/lib/playback.ts`); gesture inserts use the same rule.

## Subtitles And Narration

- SRT input is independent of the chess script. Malformed cues are visible errors.
- Cues extend playback duration when they outlast the script, and render below the
  board, never over it.
- The cue is part of the recording artifact, not chrome: it is sized as a share of the
  composed frame (~3.6%) and scales with it, so the 560px short-desktop frame gets a
  smaller cue.
- `--subtitle-cue-size`, `--subtitle-track-height`, and present mode's floating-bar
  floor are one coupled set. Declare the first two together in every `:root` that
  redefines either. A one-line cue must fit the declared track, and the floor must
  clear a two-line cue. Measure the floor on the page: the app's top padding shifts
  across height tiers. Enforced by
  `the subtitle track fits its cue in every media tier` in `test/styles.test.mjs`.
- Narration audio is independent of the script and subtitles. Its bytes persist as an
  IndexedDB draft ([src/lib/narrationStore.ts](../src/lib/narrationStore.ts)) because
  they do not fit localStorage; the object URL is session-only. A stored track is
  restored through the same probe an import goes through, and one that no longer
  decodes is dropped silently.
- The `<audio>` element follows play, pause, seek, and rate; it never drives the
  board. Narration that outlasts the script extends playback duration.
- An `ask` question card renders in the subtitle strip and replaces any cue that
  overlaps it. Its digit (whole seconds left) and ring (spent share) derive from
  `time - ask.t`, never a timer. The digit is `aria-hidden`, so the live region
  announces the question once. A script with any `ask` keeps the track on mobile even
  without an SRT. Like cues, the card is excluded from board PNG export.

## The Piece Click

Rules live in [src/lib/moveSound.ts](../src/lib/moveSound.ts) and
`test/move-sound.test.mjs`.

- The sound is a side effect of the frame, not an event handler: it watches the
  `lastMove` of the snapshot the board is rendering and sounds when that changes.
  Playback crossings, `rp` steps, scrub landings, and a gesture's paused landing are
  therefore one rule.
- It watches a value key (`squares@t`), never snapshot identity: `buildWorld`
  re-derives every snapshot on each keystroke. The timestamp is in the key so an `rp`
  re-landing of an already-played move still sounds.
- Silence follows from the key: the first frame has nothing to compare, `null` (a
  reset, a rewind to the start) never sounds, and a scrub is one comparison — ten
  crossed moves are one click.
- The sample is `public/sounds/move.mp3`, played at 0.5 volume through a four-element
  round-robin pool, because at 4× moves can land closer together than the sample is
  long. A refused `play()` is swallowed.
- Present mode keeps the sound. The transport's `SFX` toggle sits with the speed
  selector inside `.transport-prefs` and appears in both modes. New transport
  preferences go inside that wrapper: the console grid gives each child one named cell
  per tier.
- The toggle gates the call, not the volume. It persists as `'0'`/`'1'` under
  `gambit:draft:move-sound`, defaulting to on; anything but the exact `'0'` reads as
  on. Muting does not freeze the latch, so unmuting speaks the next move rather than
  the one the playhead is on.

## Export

- Board PNG export captures the board element `App` passes to `Board` as `boardRef` —
  never a separately maintained chess renderer.
- The frame is frozen by copying it, not by stopping the app. The click calls
  `snapshotBoard` synchronously: a clone of the board DOM, minus the in-flight gesture
  preview (`BOARD_GESTURE_CLASS`), mounted off-screen. Loading the exporter and
  rasterizing both work on that clone, so playback, editing, and imports carry on, and
  the PNG is the frame at the click, named for that time.
- The output is exactly 1440×1440 with transparent corners and every visible artifact
  layer. It excludes subtitles, the question card, PGN, and transport/editor chrome.
  Browser zoom and the board's on-screen size do not alter the dimensions.
- One export runs at a time; its buttons are disabled meanwhile. Unmount aborts it.
- The whole export sits under one 15s ceiling (`withTimeout`), which turns a hang
  into a visible, retryable error. A rasterize cannot be cancelled, so its download is
  gated on an `AbortSignal` and a late result delivers nothing.
- The general rule: any await a user action blocks on is bounded by one ceiling around
  the whole operation — not around the step that looks riskiest, and never nested. If
  the abandoned work can still produce a side effect, gate that effect on an abort
  signal.

## Offline Video Render

- `?render` ([src/lib/renderMode.ts](../src/lib/renderMode.ts)) opens present mode
  with its transport hidden and installs `window.gambitRender`; it never starts the
  rAF playback loop. The grabber (`scripts/render-video.mjs`) only chooses the time:
  `seek(t)` sets the clock and resolves after two frames, so the screenshot is the
  same script + FEN + time frame live playback shows.
- `.app--render` owns what a render changes on screen: the transport is hidden and
  wall-clock CSS transitions are off, since frames are taken at clock times and a
  transition would land on whatever step the grab happened to hit.
- The two-frame wait is measured, not assumed: one frame renders about 10% faster
  and never showed a stale frame, but left more frames a few levels off the
  two-frame result.
- The page plays no click (the grabber seeds the mute draft). `seek` returns whether
  its frame lands a move, from `moveSoundKey` and `shouldPlayMoveSound`, the rule
  `useMoveSound` applies, and the grabber mixes the sample at that frame's time at
  the same 0.5 volume. Enforced by
  `seek reports a landing by the live click rule` (`test/render-mode.test.mjs`).
- Drafts are the only input path: the grabber seeds them with an init script that
  runs before the app, because a loaded app flushes its own drafts on unload.
