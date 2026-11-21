---
name: Gambit
description: Cinematic, scrubbable chess timeline for creators and teachers.
colors:
  studio-steel-blue: "#5d8fc9"
  deep-set-blue: "#3a64a0"
  camera-highlight-blue: "#7da9dc"
  studio-cream: "#f1ecde"
  markup-amber: "#ffd54f"
  marker-amber: "#f0b429"
  annotation-persimmon: "#ffaa3c"
  marker-persimmon: "#f08c2e"
  capture-ember: "#ffb45a"
  stagewell-black: "#0f1525"
  stagewell-indigo: "#161e35"
  set-indigo: "#1f2a44"
  backdrop-slate: "#2a3556"
  sodium-chalk: "#e8ecf5"
  rim-light-pewter: "#c8d0e6"
  foley-pewter: "#aab3cf"
  foley-slate: "#8d97b3"
  stage-mist: "#6b7596"
  clear-marker: "#9b9b9b"
  studio-vermillion: "#cf5d5d"
  quality-brilliant: "#1baca6"
  quality-great: "#5c8bb0"
  quality-mistake: "#ffa459"
  quality-blunder: "#fa412d"
typography:
  display:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "23px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "0"
  headline:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0"
  title:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "normal"
  numeric:
    fontFamily: "Lilex, Gambit Mono CJK, ui-monospace, monospace"
    fontSize: "12.5px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "normal"
  body:
    fontFamily: "Lilex, Gambit Mono CJK, ui-monospace, monospace"
    fontSize: "12.5px"
    fontWeight: 500
    lineHeight: 1.7
    letterSpacing: "normal"
  caption:
    fontFamily: "Lilex, Gambit Mono CJK, ui-monospace, monospace"
    fontSize: "11.5px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0"
  label:
    fontFamily: "Lilex, Gambit Mono CJK, ui-monospace, monospace"
    fontSize: "10.5px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0"
  body-present:
    fontFamily: "Lilex, Gambit Mono CJK, ui-monospace, monospace"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "normal"
  subtitle:
    fontFamily: "PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, Source Han Sans SC, Microsoft YaHei, Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "29px"
    fontWeight: 600
    lineHeight: 1.36
    letterSpacing: "0"
  subtitle-mobile:
    fontFamily: "PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, Source Han Sans SC, Microsoft YaHei, Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.34
    letterSpacing: "0"
rounded:
  hairline: "2px"
  xs: "5px"
  sm: "7px"
  md: "10px"
  lg: "14px"
  xl: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "14px"
  xl: "18px"
  "2xl": "22px"
  "3xl": "28px"
components:
  button-primary:
    backgroundColor: "{colors.studio-steel-blue}"
    textColor: "{colors.studio-cream}"
    rounded: "{rounded.md}"
    height: "44px"
    width: "44px"
    padding: "0"
  button-primary-hover:
    backgroundColor: "{colors.deep-set-blue}"
    textColor: "{colors.studio-cream}"
    rounded: "{rounded.md}"
    height: "44px"
    width: "44px"
    padding: "0"
  button-icon-ghost:
    backgroundColor: "#ffffff0f"
    textColor: "{colors.rim-light-pewter}"
    rounded: "{rounded.md}"
    height: "36px"
    width: "36px"
    padding: "0"
  button-icon-ghost-hover:
    backgroundColor: "#ffffff1f"
    textColor: "{colors.sodium-chalk}"
    rounded: "{rounded.md}"
    height: "36px"
    width: "36px"
    padding: "0"
  tab-on:
    backgroundColor: "#ffffff1a"
    textColor: "{colors.sodium-chalk}"
    rounded: "{rounded.sm}"
    height: "40px"
    padding: "9px 12px"
  tab-off:
    backgroundColor: "#00000000"
    textColor: "{colors.foley-pewter}"
    rounded: "{rounded.sm}"
    height: "40px"
    padding: "9px 12px"
---

# Design System: Gambit

## 1. Overview

**Creative North Star: "The Editing Booth"**

A dim post-production room: deep navy lit by three radials — a steel-blue key light on the board column, a warm wash from the upper-left, a cool wash from the lower-right.

The board is the lit subject; everything else is the quiet chrome an editor works inside. Cream squares read like paper under a key light; Staunty SVG pieces carry a soft drop shadow. Highlights and arrows are amber and persimmon annotation pens, and they fade out because this is a recording, not a notebook.

The transport is a pro-grade timeline ruler, not a media-player widget. The subtitle track sits between board and ruler when SRT cues are loaded.

The system rejects the chess.com palette everywhere it draws (the move-quality marks are the one exception, §5), glassy AI-tool surfaces, candy-colored kids' chess, and the SaaS hero-metric template. Chrome is tonal (§4); type contrast carries hierarchy more than color.

**Layout tiers.**
- **≥1381px wide:** the side panel rests at `clamp(560px, 32vw, 620px)` inside the centered workspace.
- **1241–1380px:** two columns; the workspace goes full width and the panel flexes into what the board leaves (568→429px), so 1280×800 keeps the transport on first paint.
- **≤1240px:** the panel stacks under the board.

In every tier the artifact keeps its 720px size on ordinary laptop heights: the panel yields, never the board. Only short desktop viewports (width ≥1081px, height ≤760px) use the 560px fallback; elsewhere the page scrolls rather than shrinking the frame. The `max-height` 1040/920/840px tiers tighten chrome only. The code invariant and its test: [docs/design.md](docs/design.md).

The console spans the full workspace width under the board and panel. The panel breathes at 14–24px gaps; its header uses a compact uppercase scale so it never competes with the events below.

**Key Characteristics:**
- Navy backdrop, steel-blue key light on the board. Cream-on-blue board, never reversed.
- One gradient surface (Play). One structural shadow (the board).
- Mono for anything numeric or chess-script; sans for chrome.
- Color marks meaning (The Five Meanings Rule, §2).
- The ruler is the signature component.
- Motion is functional and exponential: pieces slide via `transform: translate3d`, arrows draw, captures flash. Nothing hovers or shimmers.

## 2. Colors: The Studio Palette

OKLCH values are approximate; frontmatter hex is normative. `src/styles.css` `:root` (CSS) and `src/lib/tokens.ts` (SVG/JS) carry the same values.

### Primary
- **Studio Steel Blue** (`#5d8fc9`, `~oklch(64% 0.10 256)`). The load-bearing brand color: dark squares, Play-gradient start, scrub-fill, move markers, current-move pill.
- **Deep-Set Blue** (`#3a64a0`, `~oklch(48% 0.10 258)`). Play-gradient end, primary hover.
- **Camera-Highlight Blue** (`#7da9dc`, `~oklch(72% 0.08 250)`). Scrub-fill end, move-marker text, focus tints.

### Secondary
- **Studio Cream** (`#f1ecde`, `~oklch(94% 0.02 80)`). Light squares, logo glyph, Play glyph. Never `#fff`.

### Tertiary

The annotation pens have two stops: a light **board stop** for overlays on the artifact, and a deeper **marker stop** for small chrome (pins, dots) that must stay saturated at 5px.

- **Markup Amber** (board `#ffd54f`, `~oklch(89% 0.16 95)`; marker `#f0b429`). Board stop: last-move flood. Marker stop: the `hl` ring, highlight pins, seek dots (Board Marks below).
- **Annotation Persimmon** (board `#ffaa3c`, `~oklch(79% 0.17 65)`; marker `#f08c2e`). Board stop: arrows at 85% alpha. Marker stop: arrow pins and dots.
- **Capture Ember** (`#ffb45a`). Capture-flash radial only (70% → 0 alpha). Never chrome.

### Neutral
- **Stagewell Black** (`#0f1525`, `~oklch(13% 0.03 268)`). Body-gradient bottom; the deepest surface.
- **Stagewell Indigo** (`#161e35`, `~oklch(18% 0.04 268)`). Body-gradient top.
- **Set Indigo** (`#1f2a44`, `~oklch(22% 0.04 263)`). Upper-left warm wash.
- **Backdrop Slate** (`#2a3556`, `~oklch(28% 0.05 268)`). Lower-right cool wash.
- **Sodium Chalk** (`#e8ecf5`, `~oklch(93% 0.012 261)`). Primary text.
- **Rim-Light Pewter** (`#c8d0e6`, `~oklch(83% 0.025 261)`). Secondary text, panel titles, ghost glyphs, `br`/`ml` pins.
- **Foley Pewter** (`#aab3cf`). Resting tab labels.
- **Foley Slate** (`#8d97b3`, `~oklch(63% 0.035 263)`). Muted text (hints, footer, ticks, time chips). The muted floor: ≥4.5:1 on every surface it sits on.
- **Stage Mist** (`#6b7596`, `~oklch(50% 0.04 263)`). Non-text only (default pin ink); below AA at small sizes.
- **Clear Marker** (`#9b9b9b`). Clear pins and dots.

### Errors
- **Studio Vermillion** (`#cf5d5d`, `~oklch(58% 0.16 22)`). Reset marker, error accent, and the check glow (radial 95% → 55%, gone by the square edge; derived from the engine position, never from a `+` in the SAN).
- Text tints: `--color-error-line` `#ff7b7b` (line numbers), `--color-reset-text` `#ff9b9b`, `--color-error-text` `#ffb4b4`.

### Named Rules

**The Five Meanings Rule.** Blue = moves, amber = highlights, persimmon = arrows, grey-mist = clears, vermillion = resets and errors. Pins, seek dots, scrub-fill, last-move tint, current-move pill, and current-event indicators draw from these. No sixth hue without a sixth event kind.

**The One Gradient Rule.** One accent gradient: the 44×44 Play button. Not counted against it: the scrub fill (same affordance); board radials of one palette color (capture flash, check glow); and `--surface-panel` / `--surface-console`, chalk washes capped under 7% so they read flat at 480p. New components add no accent gradients.

**The Annotation-Pens Rule.** Highlights belong to Amber, arrows to Persimmon. Don't cross them.

**The Derived-Alpha Rule.** An `rgba(…)` literal that decomposes to a palette color is a derived stop, not a new color. Examples: chalk tints (`--line-soft`, `--line-faint`, `--rim-light`, surface washes), the `--well-*` ladder, vermillion alphas, focus tints, the `#0f1525` `floodColor` on board drop shadows.

A literal that does **not** decompose to a palette color is a bug; new base hues go through the palette.

**Board Marks: flood vs ring.** The last move and the authored `hl` are both amber, so they differ in form:
- **Last move floods** its two squares in the board stop: 42% alpha on cream, 52% on blue (lower stops reading as amber at 480p).
- **`hl` rings** its square in the marker stop at full opacity: a circle, radius 43% of a square, stroke 6%.
- **Frequency picks the distinctive form.** The last move marks two squares every move, one usually empty; a ring there becomes noise and reads as a selection box. `hl` is rare and aimed.
- **A circle, never a rounded-rect outline:** anything restating the square's geometry reads as selection UI.
- **Marker stop, not board stop:** `#ffd54f` nearly matches cream (1.15:1); the marker stop measures 1.58:1 on cream, 1.81:1 on blue. Evenness beats peak brightness for a mark on either square.
- **Opaque:** a translucent stroke takes on the square under it, splitting one token into two colors.

## 3. Typography

**Display Font:** Schibsted Grotesk (`ui-sans-serif, system-ui, sans-serif` fallback), variable 400–900, latin subset, `public/fonts/schibsted-grotesk-var.woff2`.
**Mono Font:** Lilex (`ui-monospace, monospace` fallback), variable 100–700, latin subset, `public/fonts/lilex-var.woff2`.

Both are OFL-1.1; `public/licenses/LICENSE-fonts.txt` must travel with them. They load from `public/fonts/` via `@font-face` in `src/styles.css` and are preloaded in `index.html`: no network font hosts.

**Character.** Schibsted sets chrome (app title, panel title, tabs). Lilex sets everything chess and time: readout, speed buttons, editor, event list, kind chips, hints, footer. The script reads like code; the chrome reads like a tool. Lilex's 0.6em advance is what the readout `min-width` and the 65–75ch cap assume.

**Why these faces.** IBM Plex Sans' `wght` axis stops at 700, so it cannot set the 23px/800 wordmark. Geist is the dev-tool default reflex the anti-references reject.

**`font-display: block`, never `swap`.** The files are local and preloaded, so blocking is unobservable; `swap` risks a fallback flash and reflow mid-recording.

**CJK in the mono stack.** `--font-mono` carries a `Gambit Mono CJK` face between Lilex and the generics, for Chinese lesson scripts:
- `local()`-only (no payload ships) and `unicode-range`-scoped to Han/kana, so latin stays Lilex.
- `size-adjust: 120%`: two 0.6em cells = 1.2em, so each Han glyph lands on exactly two latin cells.
- `local()` matches PostScript/full names only, so plain family names follow as `--font-cjk` (also read by the subtitle cue). Those keep a chosen face but lose the grid.

### Hierarchy
- **Display** (Schibsted, 800, 23px, lh 1.1): the wordmark only.
- **Headline** (Schibsted, 700, 13px, uppercase): panel titles. A label, not a heading.
- **Title** (Schibsted, 700, 12.5px): tabs, chrome buttons. Compact uppercase variant at 11px / 700: section labels, view toggle, upload and present toggles.
- **Numeric** (Mono, 600/700, 12.5px): the time readout (`00:14.0 / 00:33.5`); 700 current time, 600 separator and total.
- **Body** (Mono, 500, 12.5px, lh 1.7): editor, error rows. Move-list mainline moves 13px/600 (15px/600 in Present).
- **Caption** (Mono, 500–600, 11.5px): hints, footer, FEN input, variation flows, speed segments, inline error rows.
- **Label** (Mono, 500–700, 10.5px): the floor — ticks, time chips, filenames, move-number rail. Smaller aliases at 480p; re-check Lilex's x-height here before lowering it.
- **Subtitle** (CJK-first stack ending in Schibsted, 600, 29px, lh 1.36; 26px at ≤600px wide; 22px on the 560px frame): subtitle strip only. Follows the recording frame, not the chrome scale.

### Named Rules

**The Mono-for-Chess Rule.** Chess (SAN, squares, time codes, script lines) is Lilex; chrome is Schibsted. Do not mix. It also keeps the clock frame-stable: every `--font-mono` family is monospaced, so `.time-readout` needs no `font-variant-numeric: tabular-nums`.

**The Two Small Sizes.** 10.5px is the mono Label floor; 11px is the sans compact Title. The family decides; a mono 11px or a sans 10.5px is drift.

**Icon glyphs are off the ramp.** Only `.insert-plus`'s `+` (14px) and `.pgn-x`'s `×` (12px), both commented in `styles.css`. Any *text* at 12px or 14px is drift.

**The Single-Display Rule.** 23px Display appears once. A larger label uses a larger Headline first.

**The 65–75ch Cap.** The editor caps at the panel's width (560–620px, ~70–78ch at 12.5px mono) and stays in the side column on wide viewports.

## 4. Elevation

Tonal layering, three families:

1. **Raised containers** are chalk washes: `--surface-panel` (5.8% → 2.8%) on the side panel, `--surface-console` (6.2% → 3.4%) on the console. Borders `--line-soft` (7.5% chalk); dividers and inset rings `--line-faint` (4.5%); a 1px `--rim-light` (6%) top inset on both.
2. **Recessed wells** sink with stagewell-black via `--well-08/11/20/24/28`: tab track 24%, speed track 28%, inputs 20%, panel header 11%, editor field sections 8%.
3. **Interactive states** use `rgba(255,255,255,α)`: 6% resting buttons, 10% active, 12% hover; 4% is the floor for chrome with no recess or wash.

The body backdrop: `studio-steel-blue at 10%` centered at `36% 48%`, a `set-indigo` wash upper-left, a `backdrop-slate` wash lower-right, over the navy linear.

### Shadow Vocabulary

Only these cast shadows:
- **Board ambient** (`0 30px 80px -30px rgba(20, 30, 60, 0.55), 0 8px 24px -10px rgba(20, 30, 60, 0.30), inset 0 0 0 1px rgba(0, 0, 0, 0.05)`): the one structural shadow. Board only.
- **Brand bloom** (`0 6px 16px -6px rgba(93, 143, 201, 0.7)`): Play only.
- **Logo bloom** (`0 18px 34px -18px rgba(93, 143, 201, 0.75), 0 8px 18px -14px rgba(15, 21, 37, 0.9)`): the wordmark tile. One instance.
- **Scrub-thumb halo** (`0 0 0 4px rgba(93, 143, 201, 0.35), 0 2px 6px rgba(0, 0, 0, 0.4)`): the 14px playhead disk only.
- **Playhead strand:** not a shadow; a 1px element with a `sodium-chalk` 55% → 18% vertical gradient.

### Named Rules

**The Tonal-First Rule.** To read as elevated, a surface raises α one stop on the 4/6/10/12 ladder before considering a shadow.

**The One-Bloom Rule.** Brand bloom marks the single primary action on a surface. Never two adjacent buttons; never a non-action surface.

## 5. Components

### Buttons

**The app opens paused.** The board is an authoring surface first; playback starts only when asked (transport, Space, seek). Rewind preserves the play state for the same reason.

**Primary (Play / Pause).** 44×44, `linear-gradient(135deg, studio-steel-blue → deep-set-blue)`, `studio-cream` glyph, 10px radius, brand bloom. Hover scales 1.04, active 0.96. Glyph swaps play / pause / restart in a 22×22 track.

**Secondary (Rewind, future ctrl-buttons).** 36×36, `rgba(255,255,255,0.06)`, `rim-light-pewter` glyph, 10px radius. Hover `rgba(255,255,255,0.12)` + `sodium-chalk`, no transform. Rewind returns to 0 and keeps the play state.

**Speed selector.** Four mono segments in a stagewell-black 28% track (10px radius, 1px `--line-faint` inset ring, 3px padding). Segment: `5px 9px`, `rounded.xs`, Lilex 11.5px / 600; resting `foley-slate`, active `sodium-chalk` on `rgba(255,255,255,0.12)`.

**Move-sound toggle.** One `SFX` button sharing the speed selector's track (both are recording preferences).
- Segmented states (5.3:1 resting, 9.6:1 lit), so "lit means on" matches the rate selector.
- Compact-toggle geometry: 30px, `rounded.sm`, `0 10px` padding.
- Sans compact Title (11px / 700, uppercase): `SFX` is a word, `0.5×` is a numeric.
- `::before` at `inset: -7px -4px` lifts it to a 44px target.
- On by default, persisted with the draft, visible in Present: the click is part of the recording.

Enforced by `editor controls keep the 24px hit floor` (`test/styles.test.mjs`) and `the mute draft defaults to on` (`test/move-sound.test.mjs`).

**Tab toggle (Script / Setup).** Full-width strip atop the panel: stagewell-black 24% track, 5px padding, 4px gap, 1px `--line-faint` bottom hairline. Tab: half width, 40px min-height, `9px 12px`, 7px radius, Schibsted 12.5px / 700, resting `#aab3cf`; active `sodium-chalk` on `rgba(255,255,255,0.10)` with a `--line-faint` inset ring.

### Event-kind markers

Pins and seek dots use the marker stops (§2) from `markerColors` (`src/lib/tokens.ts`). Pins rest at 0.85 opacity (1.0 hover); dots 0.5 until reached, 0.95 after. A line the snapshot builder rejected reads as `err` on both surfaces (`markerKindFor`). Move-quality marks use `annotationMarkColors`.

**Kind is never color alone.** Each kind also has a grayscale-decodable shape, in `markerForms`, reaching CSS as `data-form`:

| Pin form | Kinds |
|---|---|
| bar (2px hairline radius) | move, `br`, `ml` |
| capsule | highlight, arrow, `mind`, `reveal` |
| hollow capsule | `cl`, `ask` |
| pennant | reset, `st`, `fen`, error lines |
| stack (two segments) | `rp` |

- Kinds sharing a color never share a form, except `mind`/`reveal` (one gesture). The rarer kind takes the distinctive form.
- Forms paint as background layers, never `clip-path`, which would clip the `::before` hit target.
- Dots: highlight and `rp` square off (1.5px radius), arrow points, hollow forms (`cl`, `ask`) ring; moves have no dot.

Enforced by `two kinds that share a color differ in form` and `every marker form has a stylesheet rule` (`test/commands.test.mjs`).

### Containers (panels)

**Side panel** (`side-col`). 14px radius, `--surface-panel`, 1px `--line-soft`, 8px backdrop-blur. `clamp(560px, 32vw, 620px)` wide, spanning exactly the board + subtitle rows. `contain: size`: its content must never push those rows.

**Controls strip** (`controls`). 14px radius, `--surface-console`, 1px `--line-soft`, 6px backdrop-blur, `14px 18px` padding, full workspace width. Panel, console, and board share the radius so they read as one booth.

**Panel header** (Script page only). `16px 18px 13px` padding, 1px `--line-faint` bottom border, stagewell-black 11% tint.

### Inputs

**Script editor.** Borderless, transparent; Body mono, `16px 18px` padding, `sodium-chalk`. Focus is `:focus-visible { box-shadow: inset 2px 0 0 var(--color-camera-highlight-blue) }`, a left strand with no layout shift.

**Narration track.** Setup's last section imports audio (`accept="audio/*"`).
- Object URL is session-only; bytes persist as a best-effort IndexedDB draft.
- The hidden audio element follows the clock: play/pause, seeks (0.25s drift snap), speed via `playbackRate`. Audio never drives the board.
- Narration longer than the script extends playback, as subtitles do.
- The filename may tail-truncate; the duration readout never does.

### Signature Component: the Pro-Grade Timeline Ruler

The controls row is a 5-column grid: Play, Restart, time readout, **ruler (1fr)**, and the preferences pair (speed + move-sound) in one track.

- **Pin row (18px).** Kind-shaped pins above the rail; error lines pin as vermillion pennants.
  - 5×16 at rest; hover/focus grows via `transform: scaleY(1.375)`, never height. A 1px tail drops 7px to the rail.
  - The pin layer sits over the scrub input (`z-index: 5` vs `z-index: 4`), so a pin click seeks its exact event.
  - `<button type="button">` with `aria-label="Seek to mm:ss: <event raw>"`. `::before` gives a 40×45 target that stops above the thumb's top edge: the pin yields to the scrubber.
  - One `role="toolbar"`, one roving tab stop; ←/→/Home/End walk the pins.
- **Rail (6px).** `tonal-white-08` track, `studio-steel-blue → camera-highlight-blue` fill, `999px` radius.
- **Tick row (14px).** Mono 10.5px / 500 foley-slate labels under 1px `tonal-white-10` ticks. Base interval 5s (≤30s scripts), 10s (≤60s), 15s (≤90s), 30s (≤180s), 60s above; widened to stay within 24 ticks. Enforced by `timeline ticks stay readable and bounded` (`test/playback.test.mjs`).
- **Playhead.** A 1px `sodium-chalk` strand across all rows, capped at the rail center by a 14×14 thumb with the halo. The thumb offset is a `calc()` over the `--tl-*` tokens (`crown + padding + pin row + gap + half the rail`), never a literal, or it slides into the pin row and can't be dragged. Enforced by `the scrub thumb sits on the rail` (`test/styles.test.mjs`).

A transparent `<input type="range">` covers the ruler, so drag works anywhere but the pins. Because a scrub parks focus on the range, the range mirrors the transport keys (Space toggles, ←/→ step 1s): scrubbing never leaves the keyboard dead.

### Navigation

**Logo mark** (`public/gambit-mark.svg`). A Studio Cream pawn (a gambit is a pawn sacrifice) on one rank, on a flat Set Indigo plate with the tonal rim light.
- **Flat:** no gradient, keylight, or shadow filter in the SVG; depth comes only from the Logo bloom on `.logo`.
- **Flush:** the plate fills the viewBox at `.logo`'s ~31% radius, so the bloom hugs the art.
- **The rank is in the blue ramp** so the cream pawn separates from it, phase-shifted so the pawn stands centred on the darker square.

**Header and panel tabs.** Wordmark left; ghost actions right: **Export PNG**, then **Present**. Export is never a blue primary CTA; its exporting and done states stay ghost, confirmed in the label.

The panel opens with the Script / Setup strip; Setup holds set-once inputs (Start FEN, subtitles, narration). Tabs are `<button>`s with `role="tab"` + `aria-selected`, focus-follows-selection on arrows; the active style hooks `[aria-selected='true']`, not `.on`.

**Present mode.** Hides header, editor panel, and footer; no second playback state (docs/design.md).
- The transport becomes a fixed bottom bar that fades with the cursor after pointer idle during playback. Pointer, touch/pen, or keyboard focus restores it; **Exit** or Escape leaves. **PNG** reuses the exporter.
- The bar is `min(1080px, 92vw)`, sized to the timeline: the timeline must survive; speed and PNG/PGN/Exit yield first.
- `.app` fills the viewport, centers with `justify-content: safe center`, and reserves `--present-bar-reserve` (28px inset + 80px bar + 22px = 130px). `safe center` falls back to top-aligned so the board never rises above the scroll origin. Enforced by `present mode centers the artifact above its floating bar` (`test/styles.test.mjs`).
- The bar floats only where the frame fits above it. At ≤760px wide it returns to flow as four rows; at ≤970px tall (and on the 560px frame) as two bands, timeline on its own row. That floor keeps a two-line cue and the board's coordinates uncovered. Opacity hiding never reflows the artifact.
- Optional **PGN**: a narrow read-only mainline list (no times, annotations, variations, or editing), stacked under the board at ≤760px.
- The board keeps 720px (or 560px); no viewport-height shrink. `minmax(0, var(--artifact-fit-width))` lets it shrink with width rather than overflow into a center crop.

**Board orientation.** White / Black segmented control on Setup; White default, persisted, inherited by Present. A pure view transform: script, FEN, SAN, playback, and snapshots stay canonical; every board layer, including gesture hit-testing, shares one reversible mapping. Immediate, no animation, no `flip` command.
Enforced by `board orientation is a reversible view transform` (`test/board.test.mjs`).

**Board PNG export.** The board root only (the `boardRef` `App` passes to `Board`), at a fixed 1440×1440 regardless of zoom or working size.
- Includes every artifact layer visible at that instant, mind's-eye opacity and in-flight piece transforms included. Excludes subtitles, PGN, transport, and the gesture preview.
- The click clones the board synchronously (`snapshotBoard`), removes the `board-gesture-overlay` layer from the clone, and rasterizes the clone. Playback and editing continue during export.
- Rounded corners stay transparent; the filename carries the captured time to centiseconds.
- **A stuck export is a failure, not a state.** One 15s ceiling (`BOARD_EXPORT_TIMEOUT_MS`) over the whole operation lands in `Retry PNG` with a `PNG` row in the errors band. An abandoned export that settles late delivers nothing.

Enforced in `test/board-export.test.mjs`: `the export is 1440px and named for the board time`, `an export that never settles times out`, `an abandoned export delivers nothing`, `the gesture preview carries the class a snapshot removes`.

### Subtitle Track

A centered strip under the board, as wide as the board column, showing the active SRT cue in the Subtitle scale (§3).
- A multi-line cue grows the row downward (the one row allowed to grow), never over the board or console.
- With no cue the strip keeps its height and drops text and framing (`.subtitle-strip.is-empty`).
- Per tier, cue × line-height + padding + 2px border ≤ track (`--subtitle-cue-size`, `--subtitle-track-height`, declared together). Enforced by `the subtitle track fits its cue in every media tier` (`test/styles.test.mjs`).

**Question card.** An `ask` turns the strip into a question card for its countdown. A ring sized to the cue's line box (1.36em) leads the question, with whole seconds left in mono inside. Ring, digit, and the strip's border take the amber marker stop: a question is the teacher pointing, like `hl`, not a sixth hue. The card replaces an overlapping cue, so the track height holds.
Its pin and dot are hollow amber, apart from `hl` (filled amber) and `cl` (hollow grey).

**A11y.** `aria-live="polite" aria-atomic="true"` on the strip; the countdown digit is `aria-hidden`, so a question is announced once.

**Mobile (≤600px).** With no SRT and no `ask`, the track collapses (`.subtitle-strip.no-track { display: none }`); phones don't record. `--board-radius` drops from 14px to 8px so rank 8's coordinate survives the corner clip at ~343px.

### PGN Move List (Script panel, Moves view)

The script as a PGN move list, lichess-style in Gambit's chrome:

- **Mainline rows.** `[num 30px] [white 1fr] [black 1fr]`, number rail on `tonal-white-04`, Lilex 13px/600. A row resuming on Black shows "…" for White. Each cell: move, annotation dots, right-aligned 10.5px time. A cell whose marks wrap grows the row downward only: number, White and Black keep their first lines level.
- **Variations.** A top-level `br … ml` is an inset flow (`tonal-white-04`, mono 11.5px, lh 1.9): numbered spans (`3.Bc4`, `3…Bc5`), nested variations in parentheses, a trailing `↩` that seeks to the `ml`. Numbering derives from the position snapshots.
- **Non-move events.** Highlights, arrows, clears, `rp`: inline seek dots after their move, tooltips with time + body. Resets / `st` / `fen` are full-width vermillion breaks that restart numbering. Errors stay full rows.
- **States.** Reached at full strength, unreached dimmed, current position in a solid steel-blue pill. Event elements carry `data-evi={event index}`. A rejected move is flagged inline (error ink, vermillion wavy underline, tooltip).
- **Errors are playhead-independent.** The band shows every error and error lines pin on the ruler, wherever the playhead is.
- **Errors read in script order.** `buildWorld` sorts by line; the band is read against the text being fixed, and `role="status"` announces in that order. Enforced by `errors report in script order` (`test/world.test.mjs`).
- **The band sizes itself.** Three rows, then `Show N more`; expanded, a 240px ceiling. Cascades stay unlabeled: guessing the causal error would mislabel a correct report.
- **Header controls.** Moves / Text toggle left, `Import` right (`margin-left: auto`, so it reads as an action), the transient `Undo` grows into the gap. Enforced by `Undo grows into reserved space` (`test/styles.test.mjs`).
- **Time chips stay quiet through the token, not a fade.** Full-opacity foley-slate; body 4.5:1 must hold on the lighter variation inset. Enforced by `time chips keep their contrast on the variation inset` (`test/styles.test.mjs`).
- **Hit floor.** `pgn-mv`, `pgn-var-mv`, `pgn-ret`, the time chip, and `.pgn-x` reach 24px via transparent `::before` extensions; the visible pill is unchanged. Enforced by `editor controls keep the 24px hit floor` (`test/styles.test.mjs`).
- **A board that accepts drags looks like one.** Movable squares show `grab`. A refused press writes an `EDIT` row naming wrong turn vs no legal move (`Can't move from e7 at 00:00.0: it's White to move.`). Empty squares stay silent. Enforced by `a refused press explains itself` (`test/chess.test.mjs`).

**Editable mode.** A structured editor behind the Moves / Text toggle (Text is the fallback for comments and exotic edits; choice persisted).
- Each timed event has a click-to-edit time chip (mono 10.5px on a `tonal-white-06` pill). Enter/blur commits, Escape cancels, ↑/↓ nudges 0.1s. An unparseable value never rewrites the line: the chip flashes vermillion (a color crossfade, kept under reduced motion).
- A delete × floats in as a corner badge on hover (stagewell-black disc, vermillion ring on hover), reserving no inline space.
- `br` has no chip (its time is ordering-only); the `ml` side (`↩`, nested `)`) is editable. A variation deletes whole via its own ×; `br`/`ml` have no per-line delete.
- Clicking a move seeks. The header hint is gesture help in Moves, syntax in Text.

**Insert menu.** A dock at the foot of the Moves view: a 44px `+ Insert at <time>` trigger, `/` key hint.
- Expands upward **in flow**, not as a popover, so no ancestor overflow can clip it.
- The eight argument-free commands (`cl rs st br ml rp mind reveal`) lead as one-click rows, keeping `mind`/`reveal` above the fold.
- Below a rule, the four that need arguments are static rows naming their route (drag, right-click, right-drag, Setup) in steel blue. The menu never inserts a line that would parse as an error.
- Rows carry the kind's dot. Type is 12.5px: these rows are read once, as prose.
- One Tab stop (roving tabindex); opening focuses the first command; Escape closes and returns focus.

Enforced by `insertable and authored-elsewhere commands partition the catalogue` and `each one-click command inserts a line of its own kind` (`test/commands.test.mjs`).

### Move-Quality Marks (`!!` / `!` / `?` / `??`)

chess.com's classification treatment, adopted outright: the one exception to PRODUCT.md's chess.com anti-reference, scoped to this mark wherever it appears.

- **Brilliant** `!!` `#1baca6` · **Great** `!` `#5c8bb0` · **Mistake** `?` `#ffa459` · **Blunder** `??` `#fa412d` (`annotationColors`)

**The badge.** A radius-23 disc (SQ = 100) centred on the destination square's top-right corner. On the h-file and 8th rank it clamps inward to radius + 4, so it never leaves the 800-unit box the export rasterizes. Off the corner it clears the piece's head and reads as applied to the move. `BadgeDisc` in `Board.tsx` returns the element, so a rim is unrepresentable at a call site.

**No rim; the shadow is the edge.** Drop shadow dy 3, σ 3.5, stagewell-black at 70% — deep because `great` is 1.08:1 against the dark square.

**Glyphs are set, not drawn.** Schibsted 700 (900 closes the `?` aperture at this size). `!` and `?` at 42; `!!` at 40, +2.5 tracking; `??` at 33, +0.5, to fit the disc. Each centres on its cap height (baseline `cy + size × 0.716 / 2`, shifted by half its trailing tracking), not `dominant-baseline: central`. `<text>` rasterizes correctly because the font is self-hosted and preloaded.

**The move list keeps body AA.** `annotationMarkColors` overrides the board fills only where 4.5:1 on the variation inset (`#31384c`) requires: `great` `#8fb6d8`, `blunder` `#ff7f6d`, `brilliant` `#2cb9b3`. Marks take color inline, so no CSS property or per-kind class can disagree.

**The current row drops the color**: chalk for SAN and marks (`.pgn-varnum` inherits); the badge shows the color then.

**The landing square takes the judgment.** An annotated move's destination is tinted in the quality color (42% cream, 58% blue; `annotationSquareAlpha`); the origin keeps amber. The rarest authored mark wins the square, and it survives a crop that cuts the badge.

Enforced by `move-quality marks: chrome contrast, a rimless disc, and the corner clamp` (`test/board.test.mjs`).

### Mainline Replay (`rp` / `replay`)

A clock-derived recap, not a script expansion. At its time the board replays every applied preceding top-level move in source order, 0.5s each unless `rp <seconds>` sets the step (0.1–10s, one decimal).
- Moves inside `br` / `ml` are skipped; `rs`, `st`, and valid `fen` reset the position and take no slot.
- Overlays clear; the final frame is the canonical mainline position. The presentation PGN moves its pill across existing rows.
- Board gestures are inert during a recap: the frame is historical.
- Rejected visibly with no eligible move, inside a variation, during `mind`, past the playback ceiling, or overlapping the next event. An event exactly at the end is valid. As the last command, it extends playback.

Enforced in `test/replay.test.mjs`.

### Move List Follow-Scroll

During playback the list scrolls just enough to keep the latest reached event visible (`block: nearest`, container only; target by `data-evi`). Paused, it never moves on its own. A mouse pointer in the list pauses the follow; touch does not.

### Board Gesture Layer (Script tab only)

Left-drag a piece writes a SAN move, right-drag an arrow, right-click a highlight, stamped at the playhead on pointer-down.
- The pointer-down commit holds even if playback advances. If the script text changes before release, the gesture is rejected.
- No free 0.1s slot before the next event: rejected with an `EDIT` error, never moved elsewhere.
- Inert on Setup, which keeps the native context menu.

**Preview vocabulary.**
- **Move gestures:** editor-only marks — a 5px inset stroke on origin and hovered target, a dot (r 13) on empty legal targets, a ring (r 40) on occupied ones — in the coordinate ink pairing (steel-blue on cream, cream on blue).
- **Annotate gestures:** the exact `hl` ring (`HlRing`) or arrow a release would record, at 0.5 / 0.55 opacity, on the overlay plane.

The preview layer carries `board-gesture-overlay`. Cursor: `grabbing` for moves, `crosshair` for annotations. Mouse-only: a desktop recording workflow. Enforced by `a gesture commits only what it previewed` (`test/board.test.mjs`).

### Mind's-Eye Mode (`mind` … `reveal`)

The board as the narrator's mental sketch, for blindfold lessons.
- **Void.** Squares sink to `mindVoidLight` #101628 / `mindVoidDark` #0f1526 (near-identical, so the grid disappears); coordinates cross-fade to `mindCoordInk` #c8d0e6 and carry orientation.
- **On the clock.** Void opacity derives from playback time (`SINK_SECONDS` 0.6s), never a CSS transition, which would make a paused scrub path-dependent. Hence these colors live in `tokens.ts`. Enforced by `the void sinks on the clock and stays saturated` (`test/mind.test.mjs`) and `the mind's-eye void is not a CSS fill swap` (`test/styles.test.mjs`).
- **Forgetting curve.** Only pieces on squares the script named render: full for 1.5s, gone by 3s.
- **Rehearsal holds.** Full strength while tracked: the move on the board until the next move, and squares under a visible highlight or a live check. Enforced by `the move on the board is held at full strength` (`test/mind.test.mjs`).
- **Release.** Tracking that ends at a script event fades on the normal curve from that instant. An unpinned highlight holds only for its own 2.5s. Arrows hold nothing.
- **Overlays** keep their vocabulary and carry the light. Persistent alarms use pinned forms (`hl f7 pin`, `c4->f7 pin`).
- **`reveal`** lifts the void over the same 600ms while pieces fade up. Both ramps are functional and stay under `prefers-reduced-motion`.

## 6. Do's and Don'ts

### Do
- **Do** keep chrome in the tonal ladder: `rgba(255,255,255,α)` at α ∈ {0.04, 0.06, 0.10, 0.12}; anything else is a palette accent.
- **Do** set numerics, squares, SAN, and script lines in **Lilex**; chrome labels in **Schibsted Grotesk**.
- **Do** use the Five Meanings for any event visual.
- **Do** keep functional motion (`piece slide`, `arrow draw`, `capture flash`) and cut the rest: no hover pulses, gradient sweeps, or shimmer.
- **Do** keep chrome quieter than the board.

### Don't
- **Don't** use the chess.com palette (green-and-cream board, red-and-yellow accents). The move-quality carve-out is spent and is not a precedent.
- **Don't** ship SaaS dashboard patterns: hero metrics, icon-headline-blurb grids, gradient CTAs.
- **Don't** ship toy-chess vibes: oversize rounding, candy palette, XP bars, badges, mascots. Cap radius at 16px (`rounded.xl`).
- **Don't** ship the glassy AI reflex: stacked translucent panels, neon glows, gradient mesh, decorative `backdrop-filter`. The `controls` 6px and `side-col` 8px blurs are the ceiling.
- **Don't** use side-stripe accent borders; the editor's `:focus-visible` strand is the one functional exception.
- **Don't** use `background-clip: text` gradient text.
- **Don't** reach for modals first; affordances stay inline.
- **Don't** use pure `#000` or `#fff` in chrome: Stagewell Black (`#0f1525`) is the floor, Sodium Chalk (`#e8ecf5`) the ceiling. The badge's white glyph belongs to its carve-out.
- **Don't** animate layout. Pieces move via `transform: translate3d(${f * 100}%, ${(7 - r) * 100}%, 0)`, never `left`/`top`. Animate only `transform`, `opacity`, `box-shadow`. Easing: `cubic-bezier(0.5, 0, 0.2, 1)` for piece slides, `ease-out` elsewhere; no bounce or spring.
