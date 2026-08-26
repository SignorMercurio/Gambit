# Playback, Media, And Export

The playback clock is the source of truth. Subtitles and narration follow it and may
extend duration; neither drives the board.

## Clock And Duration

- If script duration shrinks, clamp the current playback time to the new duration.
- Event-anchored seeks must not land exactly on the event's timestamp while paused: every timed visual derives from `time - event.t`, so at age 0 the moved piece, highlight, and arrow are all invisible. Land just past the event (the `seekEvent` helper: +0.5s, clamped before the next event), the same convention gesture inserts use.

## Subtitles And Narration

- When changing subtitle behavior, keep SRT input independent from the chess script and surface malformed cues as visible errors.
- Narration audio is independent from the script and subtitles, and persists like them: the object URL is session-only, but the bytes are a draft in IndexedDB ([src/lib/narrationStore.ts](../src/lib/narrationStore.ts)) because they do not fit localStorage's few megabytes. It is restored through the same probe an import goes through, so a stored track has to clear the same bar a fresh one does, and a stored track that no longer decodes is dropped silently rather than failing every future load. The playback clock stays the source of truth: the audio element follows play/pause/seek/rate and never drives the board; narration that outlasts the script extends playback duration like subtitle cues.
- Subtitle cues should extend playback duration when they outlast the chess script and render below the board, never over it. The cue is part of the recording artifact, not chrome: it is sized as a share of the composed frame the way broadcast captions are (~3.6%, against the ~4% streaming default), and it scales with the artifact — the 560px short-desktop frame gets a smaller cue, because holding the base size there wraps the same line in two and doubles the track. Its track is `minmax(min, auto)`, so type size, track minimum, and present mode's floating-bar floor are one coupled set of numbers — `--subtitle-cue-size` and `--subtitle-track-height` are therefore declared together in every `:root` that redefines either, because splitting them across rules is exactly how the 761–840px band ended up seating a 29px cue in a 48px track: a one-line cue must fit the declared track, and the floor must clear a *two-line* one (the caption standard's cap). Measure that floor on the page rather than deriving it — the app's top padding shifts across height tiers, so the arithmetic is wrong by ~12px.

## Export

- Board PNG export captures the current rendered `.board`, never a separately maintained chess renderer. It freezes playback until the DOM clone completes, restores the prior play state, exports exactly 1440×1440 transparent-corner PNG, and includes all visible artifact layers except the editor-only in-flight gesture preview. It must exclude subtitles, PGN, and transport/editor chrome, and browser zoom must not alter output dimensions.
- Any await that a user action blocks on must be bounded. An unsettled promise never runs its `finally`, so "restore the prior state afterwards" is not a recovery path on its own — pair it with a ceiling that converts the hang into a visible, retryable error state. Put the ceiling around the whole operation, not the step that looks riskiest: a guard on the inner call is useless if an earlier await is what hangs, and it makes the code read as protected when it isn't. One ceiling per user action — nesting them multiplies the worst-case wait. If the abandoned work can still produce a side effect (a download, a write), gate that effect on an abort signal so a late arrival can't contradict the error the user was already shown.
