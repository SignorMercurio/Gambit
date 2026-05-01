# Product

## Register

product

## Users

Chess content creators and teachers: people building annotated walkthroughs, lesson videos, blog posts, or classroom material. Their working session looks like this: paste a timestamped script, scrub through the timeline, screen-record a clip or screenshot a frame, paste it into a video editor or article. They are not playing chess inside Gambit. They are presenting it.

That context dictates two things almost everywhere:

1. The board has to read clearly when downscaled, cropped, or displayed inside someone else's content. UI chrome that distracts on a creator's recording is a defect.
2. Editing the script and seeking precisely matter more than discovery features. Power-keyboard, deterministic playback, accurate scrubbing.

Secondary user: the creator's audience watching the recording. They never touch Gambit directly, but the visual artifact has to look like something a viewer takes seriously.

## Product Purpose

Render a chess game as a deterministic, scrubbable timeline driven by a tiny human-written script. SAN moves, square highlights, arrows, clears, resets, on a tagged time axis.

The script is the source of truth, the playback is the artifact, and both have to feel professional enough that a creator ships the recording without retouching.

Success looks like: a teacher writes a 30-line script, hits record, exports a clip, and never opens the timeline editor again because nothing about the playback needed correction.

## Brand Personality

Three words: **cinematic, precise, chess-native**.

- *Cinematic*: confident dark surface, the board is the hero, transport controls feel like a video editor (DaVinci Resolve, Figma dev-mode timeline, Linear's playback affordances), not a media-player widget.
- *Precise*: monospaced numerics, exact scrub, frame-stable animations, no marketing language anywhere in the UI. When the tool speaks, it speaks like a developer console: terse, factual, no exclamation marks.
- *Chess-native*: respects the conventions chess players already know (file/rank coordinates, SAN as input, last-move tinting, arrow gestures from analysis culture), but executes them with an original visual language rather than mimicking Lichess or chess.com tile-for-tile.

## Anti-references

What Gambit must not look like:

- **Generic SaaS dashboard.** No hero-metric template, no identical icon-headline-blurb card grids, no gradient-accent CTA buttons. The tool has zero "marketing" in it.
- **Toy or cartoon chess apps.** No oversize rounded everything, no candy palette, no XP bars, streaks, badges, mascots, or gamified rewards. Adults are using this for work.
- **Default chess.com aesthetic.** Keep the visual distance the prototype already established: no green-and-cream board, no chess.com red-and-yellow accent set. Chess-native conventions, fresh execution.
- **Glassy / blurry / glowy AI-tool reflex.** No stacked translucent panels, no neon glows, no gradient-mesh hero, no decorative backdrop-filter. The current controls strip uses a 6px blur for a real reason (it floats over the board's color); that is the ceiling, not the floor.

## Design Principles

1. **The board is the canvas, the chrome is a frame.** Every UI surface defers to the board. If a creator records the screen and the chrome competes for attention with the chess position, the chrome is wrong. Reduce contrast on chrome, increase it on the artifact.
2. **Pro-grade transport, not consumer playback.** Scrubber, time-readout, speed selector, and event markers belong in the visual family of a video editor's timeline. Monospaced numerics, deliberate hit targets, exact seek, color-coded markers that mean something at a glance. Never a Spotify-mini-player aesthetic.
3. **Recordable by default.** Every state has to survive a screenshot or 480p downscale. Highlights and arrows must read at small sizes; typography sizes must hold up after 1080p compression; no 1px decoration that aliases on capture; no animation that depends on a 60Hz screen to make sense.
4. **Chess conventions intact, visual language original.** Files and ranks where players expect them; SAN, highlight, arrow as the script's primitives; last-move tinting and capture cues familiar to anyone who's used a study tool. But no inherited palettes from the obvious chess sites; the look is Gambit's, not a port.
5. **Motion that earns its frame.** Piece slides, arrow draws, capture flashes are functional, exponential, and brief. Anything decorative gets cut. `prefers-reduced-motion` shortens or removes non-essential animation; functional animation (a piece sliding to its destination) stays, because removing it would make the playback harder to follow.

## Accessibility & Inclusion

No formal commitment locked in yet; decisions per surface.

Working baseline: WCAG 2.1 AA contrast where it does not fight the cinematic mood (chrome hits AA against the dark backdrop; the board's own light/dark squares are an artifact of the chess convention, not chrome, and are exempted from the contrast target). All controls keyboard-reachable; space, arrow keys, and click-to-seek are core, not extras. `prefers-reduced-motion` respected for non-essential motion (decorative fades, hover scales) but not for functional motion (a piece reaching its target square).

Open questions for later: localized SAN (figurine notation, non-Latin notation), high-contrast piece set, larger hit targets for touch, dyslexia-friendly mono alternative for the script editor. None blocks the current scope.
