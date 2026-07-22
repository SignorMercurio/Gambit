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
  chip-text-blue: "#b8d0ec"
  foley-slate: "#8d97b3"
  stage-mist: "#6b7596"
  clear-marker: "#9b9b9b"
  studio-vermillion: "#cf5d5d"
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
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "12.5px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "normal"
  body:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "12.5px"
    fontWeight: 500
    lineHeight: 1.7
    letterSpacing: "normal"
  caption:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "11.5px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0"
  label:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "10.5px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0"
  subtitle:
    fontFamily: "PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, Source Han Sans SC, Microsoft YaHei, Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 600
    lineHeight: 1.36
    letterSpacing: "0"
  subtitle-mobile:
    fontFamily: "PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, Source Han Sans SC, Microsoft YaHei, Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "19px"
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

Gambit looks like a dim post-production room. The room is in deep navy blue lit by three radials: a steel-blue key light pooled on the board column, a warm wash from the upper-left, a cool wash from the lower-right. The chess board is the lit subject in the middle of the desk; everything around it (transport controls, the script panel, the event list) is the kind of quiet chrome a colorist or sound editor lives inside. The board's cream squares read like paper under a key light. The pieces are Staunty SVG silhouettes, treated like physical objects with a soft drop shadow. Highlights and arrows are amber and persimmon, the colors annotation pens leave on a print, and they fade back out the way real pen ink wouldn't, because this is a recording, not a notebook.

The transport sitting under the board is a pro-grade timeline ruler, not a media-player widget: kind-colored marker pins above the rail, mono time-tick labels below, a vertical playhead strand crossing the whole console. Between the board and the ruler sits the subtitle track, shown when SRT cues are loaded.

The system rejects the chess.com palette outright (no green-and-cream board, no the-app's red-and-yellow accents). It rejects glassy AI-tool surfaces, candy-colored chess apps for kids, and the SaaS hero-metric template. There is exactly one accent gradient in the entire UI (the Play button); every other accent is a single solid color. Body chrome is tonal: raised surfaces wash chalk-tinted alpha over the dark gradient (the panel and console washes stay under 7%), recessed wells (tab track, speed track, inputs) sink with stagewell-black alpha, and interactive states ride the four-stop white ladder (4%, 6%, 10%, 12%). Type contrast carries hierarchy more than color does.

Density is studied. In the two-column desktop layout (≥1381px; the stack point is 1380px) and the stacked single-column layout, the recording artifact stays at its 720px design size on ordinary laptop heights. Width still caps it naturally on phones; only genuinely short desktop viewports (width ≥1081px and height ≤760px) opt into the 560px working fallback. At every other height the page may scroll rather than silently shrinking a recording frame into the 500px range. The ≤920px and ≤840px squeeze tiers tighten chrome only. The transport console spans the full workspace width beneath the board column and the side panel; the side panel rides a 560–620px column (`clamp(560px, 32vw, 620px)`) and breathes at 14px–24px gaps; the panel header has its own typographic scale (uppercase, compact, smaller than the body) so it never competes with the events below it. The cinematic, precise, chess-native triad from PRODUCT.md is the line: cinematic in the surface posture, precise in the monospaced numerics and the deterministic playback, chess-native in respect for files-and-ranks and SAN.

**Key Characteristics:**
- Dark navy backdrop with a steel-blue key-light pool centered on the board column. Cream-on-blue board, never reversed.
- Quiet tonal chrome. One gradient surface only (Play). One ambient drop shadow only (the board).
- Typography is the structural device: monospaced for anything numeric or chess-script, sans for chrome titles.
- Color marks meaning, not decoration. Move = blue, highlight = amber, arrow = persimmon, clear = grey-mist, reset/error = vermillion. These five hues drive every marker, scrub-fill, last-move tint, current-move pill, and current-event indicator.
- Pro-grade transport: marker pins above the rail, time-tick labels below, full-height playhead strand. The ruler is the signature component.
- Motion is functional and exponential. Pieces slide via `transform: translate3d`, arrows draw, captures flash. Nothing hovers or shimmers.

## 2. Colors: The Studio Palette

A cinematic dark-studio palette built around one structural blue, one warm cream, two warm annotation accents, and a shaded navy ramp the chrome rides on. OKLCH values below are eyeball-grade approximations; hex in the frontmatter is normative.

### Primary
- **Studio Steel Blue** (`#5d8fc9`, `~oklch(64% 0.10 256)`). The single load-bearing brand color. Lives in the board's dark squares, the Play-button gradient start, the active scrub-fill, the move-marker chip family, and the current-move pill. Saturated enough to read against the cream squares and the navy surface; restrained enough not to behave like a SaaS-blue accent.
- **Deep-Set Blue** (`#3a64a0`, `~oklch(48% 0.10 258)`). The Play-button gradient end and primary-hover state. Reads as the steel blue, one stop deeper.
- **Camera-Highlight Blue** (`#7da9dc`, `~oklch(72% 0.08 250)`). The scrub-fill gradient end and the move-marker chip text. The "lit-from-above" stop in the blue family.

### Secondary
- **Studio Cream** (`#f1ecde`, `~oklch(94% 0.02 80)`). The light squares, the logo glyph, the Play-button glyph. Warm enough to balance the cool navy, never `#fff`.

### Tertiary

The annotation pens are two-stop families: a light board stop for overlay tints on the recorded artifact, and a deeper marker stop for small chrome (timeline pins, seek dots) that must stay saturated at 5px sizes.

- **Markup Amber** (board stop `#ffd54f`, `~oklch(89% 0.16 95)`; marker stop `#f0b429`). The board stop carries user highlights and last-move tinting: 55% alpha on the highlighted square, and per-square-color last-move tints — 42% alpha on cream squares, 52% on blue squares (below those alphas the mix desaturates until it stops reading as amber, especially after a 480p downscale). The marker stop carries the highlight pins and seek dots. Reads like a highlighter pen across a printed page.
- **Annotation Persimmon** (board stop `#ffaa3c`, `~oklch(79% 0.17 65)`; marker stop `#f08c2e`). The board stop is the arrow color, used at 85% alpha on the stroke; the marker stop carries arrow pins and dots. The bolder, warmer cousin of Amber. Together they form the "annotation pens" pair.
- **Capture Ember** (`#ffb45a`). The capture-flash radial only (70% alpha fading to 0): a derived warmth between the two pens, board-layer functional, never chrome.

### Neutral
- **Stagewell Black** (`#0f1525`, `~oklch(13% 0.03 268)`). The body-gradient bottom; the deepest surface in the system.
- **Stagewell Indigo** (`#161e35`, `~oklch(18% 0.04 268)`). The body-gradient top.
- **Set Indigo** (`#1f2a44`, `~oklch(22% 0.04 263)`). The radial-gradient warm wash from the upper-left "off-stage light".
- **Backdrop Slate** (`#2a3556`, `~oklch(28% 0.05 268)`). The radial-gradient cool wash from the lower-right.
- **Sodium Chalk** (`#e8ecf5`, `~oklch(93% 0.012 261)`). Primary text on chrome.
- **Rim-Light Pewter** (`#c8d0e6`, `~oklch(83% 0.025 261)`). Secondary text, panel titles, ghost-button glyphs, and the neutral `br`/`ml` structural pins.
- **Foley Pewter** (`#aab3cf`). Resting tab-label text; one stop quieter than Rim-Light Pewter.
- **Foley Slate** (`#8d97b3`, `~oklch(63% 0.035 263)`). Muted text: panel hints, app-sub, footer, time ticks, time chips. Verified ≥4.5:1 against every surface it sits on; the muted floor for readable text.
- **Stage Mist** (`#6b7596`, `~oklch(50% 0.04 263)`). Non-text uses only (the default pin ink before kind color applies); below AA at small sizes, so never for readable text.
- **Clear Marker** (`#9b9b9b`). The grey-mist stop of the Five Meanings: clear pins and dots.
- **Chip-Text Blue** (`#b8d0ec`). Move-number ink inside the current-move pill.

### Errors
- **Studio Vermillion** (`#cf5d5d`, `~oklch(58% 0.16 22)`). Reset-event marker, error-row accent, and the check glow under a checked king (a radial fade from 95% to 55% alpha, gone by the square edge; derived from the engine position, never from a `+` in the SAN). Derived light tints (`#ff7b7b`, `#ff9b9b`, `#ffb4b4`) carry line numbers, error text, and reset-row text. The derivatives live in DESIGN.json's `colorMeta.studio-vermillion.tonalRamp`.

### Named Rules

**The Five Meanings Rule.** Five colors carry semantic load: blue for moves, amber for highlights, persimmon for arrows, grey-mist for clears, vermillion for resets and errors. Every timeline marker pin, every seek dot, the scrub-fill, the last-move tint, the current-move pill, and current non-move indicators pull from this list. Don't introduce a sixth without a sixth event kind to attach it to.

**The One Gradient Rule.** The system has exactly one accent gradient: the 44×44 Play button (`linear-gradient(135deg, studio-steel-blue, deep-set-blue)`). The scrubber's fill is a tonal blue gradient internal to the timeline component and counts as part of the same affordance, not a second gradient. Board-layer functional visuals (the capture flash, the check glow) are radial fades of a single palette color; they are part of the recorded artifact, not chrome accents, and don't count against this rule. The side panel and console backgrounds (`--surface-panel`, `--surface-console`) are vertical chalk-alpha washes capped under 7% opacity — elevation treatment, not accents; they must stay subtle enough to read as flat surfaces on a 480p recording. Every other accent is a single solid hex. New components do not introduce accent gradients.

**The Annotation-Pens Rule.** Amber and Persimmon are not two colors; they are a pair, used together to imply a creator's two-pen toolkit. Highlights belong to Amber. Arrows belong to Persimmon. Don't cross them.

**The Derived-Alpha Rule.** `rgba(…)` literals in `styles.css` and SVG attributes that decompose to a named palette color at an alpha stop are derived stops, not new colors: the chalk tints (`--line-soft/faint`, `--rim-light`, the surface washes), the `--well-*` ladder (stagewell-black alphas), vermillion alphas (the chip-reject flash, the wavy error underline, the errors band), camera-highlight-blue focus tints, and the `#0f1525` `floodColor` on the board's SVG drop-shadows (stagewell-black as shadow ink). A literal that does **not** decompose to a palette color is a bug. New derived stops are fine; new base hues go through the palette.

## 3. Typography

**Display Font:** Schibsted Grotesk (with `ui-sans-serif, system-ui, sans-serif` fallback). Self-hosted variable font, weight range 400–900, latin subset (`public/fonts/schibsted-grotesk-var.woff2`).
**Mono Font:** JetBrains Mono (with `ui-monospace, monospace` fallback). Self-hosted variable font, weight range 100–800, latin subset (`public/fonts/jetbrains-mono-var.woff2`).

Both families load from `public/fonts/` via `@font-face` in `src/styles.css` and are preloaded in `index.html` — no network font hosts, so first paint doesn't depend on a CDN and the app keeps its voice behind blocked font hosts.

**Character:** Two voices, deliberate split. Schibsted Grotesk handles the chrome (the app title, the panel title, the tab labels) — a grotesque with sharp, subtly angled terminals that fit the precision-instrument identity while staying crisp at the 10.5–13px chrome sizes. JetBrains Mono handles everything chess and time related: the time-readout, the speed buttons, the script editor, the event list, the event-kind chips, the script-syntax hints, the footer. The pairing carries the principle that the script is a human-written artifact and should read like code, while the chrome reads like a tool.

### Hierarchy
- **Display** (Schibsted, 800, 23px, line-height 1.1, letter-spacing 0): the "Gambit" wordmark in the header. The single largest label in the UI; nothing competes with it.
- **Headline** (Schibsted, 700, 13px, letter-spacing 0, uppercase): panel titles ("Script", "Setup"). Small and compact, set in caps. The size restraint is the point; this is a label, not a heading.
- **Title** (Schibsted, 700, 12.5px): tab labels and chrome button text. Its compact uppercase variant (10.5–11px / 700: section labels, the view toggle, upload buttons) carries the same voice one size down.
- **Numeric** (Mono, 600/700, 12.5px): the time-readout (`00:14.0 / 00:33.5`). Bumped to 700 for the current time, 600 for the separator and total, color-graded by role. Monospaced so digit width is stable across frames; the readout never reflows during playback. Critical to the cinematic principle.
- **Body** (Mono, 500, 12.5px, line-height 1.7): the script editor textarea, the move list's mainline moves (13px/600), error rows. Line-height is generous (1.7) because the editor is a working surface; users read and write here.
- **Caption** (Mono, 500–600, 11.5px): the working-surface small tier — panel hints, the footer, the FEN input, variation flows, speed segments, inline error rows.
- **Label** (Mono, 500–700, 10.5px): the micro-metadata floor — time-tick labels, time chips, filenames, the move-number rail. 10.5px is the system's smallest type; anything smaller aliases on downscaled recordings.
- **Subtitle** (CJK-first stack ending in Schibsted, 600, 21px, line-height 1.36; 19px at ≤600px): the subtitle strip only. CJK-first because lesson scripts are frequently Chinese; sized to survive a 480p downscale. The 19px mobile step is a documented ramp size, not drift.

### Named Rules

**The Mono-for-Chess Rule.** Anything chess-related (SAN, square coordinates, time codes, script lines) is set in JetBrains Mono. Anything chrome-related (the app title, panel titles, tab labels, button labels) is set in Schibsted Grotesk. The split is structural; do not mix.

**The Single-Display Rule.** The 23px Display weight appears once: the "Gambit" wordmark. Subheadings, page titles, modal titles do not graduate to Display. If a future surface needs a larger label, use Headline at a larger size before promoting to Display.

**The 65–75ch Cap.** The script editor textarea is the only place body type accumulates into long-form content. Line length there caps at the editor's natural panel width (560–620px column / ~70–78ch at the 12.5px mono — the 620px maximum brushes the cap's ceiling); on a wider viewport the editor stays in the side column rather than expanding further.

## 4. Elevation

Gambit uses tonal layering with one structural shadow, in three families:

1. **Raised container surfaces** are chalk-tinted washes, not flat whites: the side panel rides `--surface-panel` (vertical chalk alpha 5.8% → 2.8%) and the console rides `--surface-console` (6.2% → 3.4%). Hairlines come from `--line-soft` (7.5% chalk) for container borders and `--line-faint` (4.5% chalk) for internal dividers and inset rings; both raised surfaces wear a 1px `--rim-light` (6% chalk) top inset.
2. **Recessed wells** sink with `stagewell-black` alpha instead of lifting with white, via the `--well-08/11/20/24/28` ladder: the tab track (24%), the speed track (28%), text inputs (20%), the panel header tint (11%), the editor field sections (8%).
3. **Interactive states** keep the four-stop white ladder `rgba(255,255,255,α)`: **6%** for resting buttons (ghost icon button, upload button), **10%** for active states (active tab), **12%** for hover states (hovered ghost button on top of an already-active context); **4%** remains the floor for any future resting chrome that has no recess or wash of its own.

Behind the chrome, the body backdrop layers three radial-gradient washes over the navy linear: a tight `studio-steel-blue at 10%` key-light pool centered at `36% 48%` (under the board column); a `set-indigo` warm wash anchored at the upper-left corner; a `backdrop-slate` cool wash anchored at the lower-right. The result is that the board reads as physically lit, not just centered.

Three surfaces use a real `box-shadow`:

1. The board: `0 30px 80px -30px rgba(20, 30, 60, 0.55), 0 8px 24px -10px rgba(20, 30, 60, 0.30), inset 0 0 0 1px rgba(0, 0, 0, 0.05)`. A two-layer ambient shadow tinted toward the surface base, lifting the board off the studio floor. This is the only structural shadow in the system.
2. The Play button: `0 6px 16px -6px rgba(93, 143, 201, 0.7)`. A colored bloom under the only gradient surface in the UI. Not ambient shadow; brand glow tied to the brand color.
3. The logo mark: `0 18px 34px -18px rgba(93, 143, 201, 0.75), 0 8px 18px -14px rgba(15, 21, 37, 0.9)`. A brand bloom plus ground shadow under the wordmark tile — the header's one lit object, same family as the Play bloom, never repeated elsewhere.

### Shadow Vocabulary
- **Board ambient** (`0 30px 80px -30px rgba(20, 30, 60, 0.55), 0 8px 24px -10px rgba(20, 30, 60, 0.30), inset 0 0 0 1px rgba(0,0,0,0.05)`): the studio floor under the board. Use only on the board.
- **Brand bloom** (`0 6px 16px -6px rgba(93, 143, 201, 0.7)`): the colored bloom under the Play button. Use only on the single primary-action button at any one surface.
- **Logo bloom** (`0 18px 34px -18px rgba(93, 143, 201, 0.75), 0 8px 18px -14px rgba(15, 21, 37, 0.9)`): the header wordmark tile. One instance; do not extend to other header elements.
- **Scrub-thumb halo** (`0 0 0 4px rgba(93, 143, 201, 0.35), 0 2px 6px rgba(0, 0, 0, 0.4)`): the playhead disk. A 4px brand-tinted ring around a 14px sodium-chalk circle plus a small ground shadow. Use only on the timeline thumb.
- **Playhead strand** (linear-gradient on `sodium-chalk` from 55% to 18% alpha, top-to-bottom): the vertical line crossing the timeline ruler. Not a `box-shadow`; the strand is a 1px-wide DOM element with a vertical alpha gradient. Reads at recording resolution.

### Named Rules

**The Tonal-First Rule.** Surfaces stack via translucent whites, not shadows. If a new surface needs to read as elevated, raise its `α` by one stop on the 4/6/10/12 ladder before considering a real shadow.

**The One-Bloom Rule.** Brand bloom (the colored shadow) is reserved for the single primary action on any given surface. Never decorate two adjacent buttons with bloom; never put bloom on a non-action surface.

## 5. Components

### Buttons

**Primary action (Play / Pause).** A 44×44 square button with a `linear-gradient(135deg, studio-steel-blue → deep-set-blue)` background, `studio-cream` glyph, 10px radius, brand-bloom shadow. Hover scales the button to 1.04 (transform, not layout); active scales to 0.96. The glyph swaps between play / pause / restart icons depending on state; the icon track stays at 22×22 inside the 44×44 container.

**Secondary action (Rewind, future ctrl-buttons).** A 36×36 square button, `rgba(255,255,255,0.06)` resting background, `rim-light-pewter` glyph, 10px radius. Hover lifts to `rgba(255,255,255,0.12)` and `sodium-chalk` glyph; no transform on hover. Used for non-primary transport actions. The rewind button returns the playhead to 0 while preserving the play state (paused stays paused), so it never duplicates the primary button's end-state replay.

**Speed selector.** A 4-button mono-font segmented group inside a recessed `stagewell-black` 28% track (10px radius, 1px `--line-faint` inset ring, 3px padding). Each segment is `5px 9px` padding, 5px radius (`rounded.xs`), default `foley-slate` text on transparent, active `sodium-chalk` text on `rgba(255,255,255,0.12)` background. Type is JetBrains Mono 11.5px / 600. Reads like a video editor's transport-rate selector.

**Tab toggle (Script / Setup).** A full-width two-segment strip across the top of the side panel: recessed `stagewell-black` 24% track, 5px padding, 4px gap, 1px `--line-faint` bottom hairline. Each tab flexes to half the panel width, 40px min-height, `9px 12px` padding, 7px radius, Schibsted 12.5px / 700, default `#aab3cf` text; active `sodium-chalk` text on `rgba(255,255,255,0.10)` with a 1px `--line-faint` inset ring.

### Event-kind markers

Non-move events surface as kind-colored dots and pins rather than filled chips. Scrubber marker pins and the move list's seek dots share one saturated palette — `#5d8fc9` move, `#f0b429` highlight, `#f08c2e` arrow, `#9b9b9b` clear, `#cf5d5d` reset/error — pins resting at 0.85 opacity (1.0 on hover), dots dimmed at 0.5 until reached (0.95 after). The palette lives once in `markerColors` (`src/lib/tokens.ts`); the move-quality marks use the separate `annotationColors` set.

**Kind is never color alone.** Each semantic family also carries a shape, decodable in grayscale. Pins: moves and `br`/`ml` are square-cut (2px hairline radius), annotation pens (highlight / arrow / clear) are capsules, structural breaks and script errors (reset / `st` / `fen` / error lines) are pointed pennants painted without clipping the button or its enlarged hit target. Dots: highlight squares off (1.5px radius), arrow points (a small triangle), clear hollows to a ring; moves need no dot — they are text.

### Containers (panels)

**Side panel** (`side-col`). 14px radius, `--surface-panel` chalk wash background, 1px `--line-soft` border, 8px backdrop-blur (load-bearing because the panel sits over the surface gradient and would feel weightless without it). It rides a 560–620px column (`clamp(560px, 32vw, 620px)`) and spans exactly the board + subtitle rows of the workspace grid, so its bottom edge aligns with the subtitle strip above the console. The panel carries `contain: size`: its height comes from the spanned rows, and its content must never push them.

**Controls strip** (`controls`). 14px radius, `--surface-console` chalk wash, 1px `--line-soft` border, 6px backdrop-blur, `14px 18px` internal padding, spanning the full workspace width beneath the board column and the side panel. The radius matches the side panel and the board, so the three primary surfaces read as a unified editing booth, not three separate cards.

**Panel header** (inside `side-col`). `16px 18px 13px` padding, 1px `--line-faint` bottom border, a faint `stagewell-black` 11% recess tint. Carries the Headline label plus a Body-mono hint on the Script page; the Setup header is the label alone.

### Inputs

**Script editor textarea.** Borderless transparent background; relies on its container (the side panel) for surface. Mono Body type (12.5px / 500 / 1.7 line-height), `16px 18px` internal padding, `sodium-chalk` text. The native focus outline is replaced by `:focus-visible { box-shadow: inset 2px 0 0 var(--color-camera-highlight-blue) }` so keyboard focus shows a left strand without disturbing layout. The lack of border is intentional: the editor is a working surface inside a documented panel, not a form field that needs distinguishing.

**Narration track.** The Setup page's last section imports a narration audio file (`accept="audio/*"`, object URL, session-only by design; audio blobs don't belong in the localStorage drafts). The audio element is invisible and follows the playback clock: play/pause, seeks (0.25s drift snap), and the speed selector via `playbackRate`. Narration longer than the chess script extends playback duration, mirroring the subtitle rule. The clock stays the single source of truth; audio never drives the board. The filename may tail-truncate, the duration readout next to it never does.

### Signature Component: the Pro-Grade Timeline Ruler

The full controls row is the project's signature component, carrying "Pro-Grade Transport, not consumer playback" by itself. It is a 5-column grid: Play, Restart, time-readout, **timeline ruler (1fr)**, speed selector. The ruler column is the visual centerpiece: a three-row sub-grid inside the same `controls` surface, stretching across the full workspace width, 6px backdrop-blur, mono numerics that never reflow.

The ruler stacks three rows over the rail:

- **Pin row (top, 18px)**. Kind-colored, kind-shaped marker buttons hang above the rail (shape vocabulary under Event-kind markers; script-error lines pin here too, as vermillion pennants). Each pin is 5×16 at rest, growing on hover/focus via `transform: scaleY(1.375)` — never a height animation — with a hairline 1px tail dropping 7px to the rail so the pin feels anchored. The pin layer rides above the transparent scrub input (`z-index: 5`, `pointer-events: none` on the layer, `auto` on the pins) so a pin click seeks its exact event instead of raw-scrubbing near it. Pins are real `<button type="button">` elements with `aria-label="Seek to mm:ss: <event raw>"`; a `::before` pseudo-element extends the hit area to ~44×44, reaching up into the console's free padding and stopping at the rail's top edge so pin targets never steal the rail's own scrub clicks. The row is a `role="toolbar"` with one roving tab stop: Tab enters once, ←/→/Home/End walk the pins, Tab leaves — dozens of pins never cost dozens of Tab presses.
- **Rail (middle, 6px)**. The same `tonal-white-08` track and `studio-steel-blue → camera-highlight-blue` linear-gradient fill as before. Pill radius (`999px`).
- **Tick row (bottom, 14px)**. Mono-numeric time labels (10.5px / 500, foley-slate; the Label-tier size floor, anything smaller aliases on downscaled recordings) at adaptive intervals: every 5s for scripts ≤30s, every 10s ≤60s, every 15s ≤90s, every 30s ≤180s, every 60s above. Each label is preceded by a 1px `tonal-white-10` tick mark hung above it, anchoring the ruler visually.
- **Playhead strand**. Above and across all three rows: a 1px-wide vertical line in `sodium-chalk` with a top-to-bottom alpha gradient (55% → 18%), capped at the rail center by a 14×14 sodium-chalk thumb wearing the Scrub-thumb halo. The strand reads at small recording resolutions; the thumb anchors precise scrub.

Native `<input type="range">` is rendered transparent and stretched over the entire ruler; click-and-drag works anywhere in the console (pins excepted — they seek exactly), and arrow keys move time at 1s steps via the global keyboard handler. Because every mouse scrub parks focus on the range, the range mirrors the transport keys itself (Space toggles, ←/→ step 1s); scrubbing must never leave the keyboard dead.

### Navigation

**Panel mode tabs.** A full-width two-tab strip at the top of the side panel (Script / Setup); the header itself carries only the wordmark. The Script page is the primary surface — the PGN editor and nothing else; Setup collects the set-once inputs (Start FEN, subtitles, narration audio). Already documented under Buttons → Tab toggle. The tab `<button>`s carry `role="tab"` + `aria-selected` with arrow-key focus-follows-selection; the active state hooks on `[aria-selected='true']`, not on a `.on` class.

### Subtitle Track

A centered caption strip directly under the board, max-width matched to the board column, showing the SRT cue active at the current time. Type is large (21px, CJK-first stack) and high-contrast so it survives a 480p screen-recording downscale; a multi-line cue grows the row downward — the one grid row allowed to expand — rather than overlapping the board or the console. When no cue is active the strip keeps its reserved height but clears its text and framing (`.subtitle-strip.is-empty` drops the border and background), so the idle frame is invisible on a recording without shifting layout. The side panel spans exactly the board + subtitle rows, so its bottom edge lines up with the subtitle strip's, above the full-width console.

**A11y.** The strip carries `aria-live="polite" aria-atomic="true"`, so screen readers announce a cue when it changes without forcing focus.

**Mobile (≤600px).** The stable-dimensions rule serves screen recording, which does not happen on a phone: when no SRT is loaded at all, the subtitle track collapses (`.subtitle-strip.no-track { display: none }`) instead of pushing the transport down; with cues loaded it keeps its reserved height so playback never shifts layout. The board's corner radius also steps from 14px to 8px (`--board-radius`) so the rank-8 coordinate survives the corner clip at ~343px board sizes.

### PGN Move List (Script panel, Moves view)

The Script panel's Moves view renders the script as a PGN move list — the lichess analysis-panel convention restated in Gambit's chrome — instead of a flat one-event-per-row log:

- **Mainline rows.** A `[num 30px] [white 1fr] [black 1fr]` grid, number rail on `tonal-white-04`, every move in JetBrains Mono 13px/600. A row that resumes on Black's move after an interruption shows the PGN "…" placeholder in the White cell. Each cell carries the move, its annotation dots, and a right-aligned 10.5px mono time.
- **Variations.** A top-level `br … ml` block renders as an inset flow (`tonal-white-04` background, mono 11.5px, line-height 1.9): numbered move spans (`3.Bc4`, `3…Bc5`; the number reappears after any interruption), nested variations in parentheses, and a trailing `↩` that seeks to the `ml`. Move numbering derives from the position snapshots, so it stays correct across variations, FEN loads, and resets.
- **Non-move events.** Highlights, arrows, and clears render as small kind-colored seek dots (same hues as the timeline pins) attached inline after the move they follow; tooltips carry time + body. Resets / `st` / `fen` are full-width vermillion section breaks; numbering restarts beneath them. Script errors stay loud as full rows.
- **States.** Reached events read at full strength, not-yet-reached ones sit dimmed, and the current position (the last reached event) wears a solid steel-blue pill — Five Meanings: move — mirroring lichess's current-move highlight. Every event-mapped element carries `data-evi={event index}` so the highlight and the follow-scroll work regardless of nesting. A move the snapshot builder rejected (illegal SAN, bad FEN) is flagged inline — error-tint ink plus a vermillion wavy underline and a tooltip — so a broken line is findable at a glance, not only in the errors band.
- **Errors are playhead-independent.** The errors band always reflects the complete script error collection, and error lines pin on the timeline ruler as vermillion pennants: an author paused at 0:00 sees the invalid move at 0:37. Error visibility must never depend on where the playhead happens to sit.

**Editable mode.** The list is a structured editor behind a Moves / Text segmented toggle (speed-group pattern; Text is the fallback for comments and exotic edits, choice persisted like the drafts). Every timed event pairs with a click-to-edit time chip (mono 10.5px — the Label floor — on a faint `tonal-white-06` pill, so timestamps read as objects distinct from move numbers; input commits on Enter/blur, cancels on Escape, ↑/↓ nudges 0.1s; an unparseable value never rewrites the line and never vanishes silently — the chip flashes a vermillion fade, a pure color crossfade that stays under reduced motion) and a delete × that floats in as a corner badge on hover (stagewell-black disc, vermillion ring on hover) — it reserves no inline space, so the resting layout stays as compact as the read-only view. `br` gets no chip at all: its timestamp is ordering-only (the board looks identical for any value between the neighboring events), so exposing it would invite meaningless edits — only the `ml` side (the visible snap-back moment) is editable, via the `↩` chip and nested `)` chips. A variation block deletes as a whole via its own × at the block's top-right; `br`/`ml` never carry per-line deletes, so their pairing can't be half-deleted. Clicking a move still seeks, so the board previews the position being edited. The header hint is contextual: gesture help in Moves, line syntax in Text.

### Move List Follow-Scroll

While playback runs, the list tracks the playhead: whenever the most recently reached event changes, the list scrolls just enough to keep that element visible (`block: nearest` semantics, container-only, never the page; the target is found via its `data-evi` attribute). While paused the list never moves on its own — editing must not fight the scroll position. Manual reading also wins over following: a mouse pointer entering the list pauses the follow, leaving resumes it. Touch pointers do not pause it (no hover concept). This is the video-editor convention the transport already commits to; without it the current-move pill is invisible for the second half of any script longer than the panel.

### Board Gesture Layer (Script tab only)

With the Script tab active, the board accepts mouse gestures that write script lines: left-drag a piece for a SAN move, right-drag for an arrow, right-click for a highlight, each stamped at the playhead captured when the pointer goes down. The gesture keeps that pointer-down commit callback even if playback advances while the pointer is held, so the preview and script edit always resolve against the same position; if the script text itself changes before release, the stale gesture is rejected instead of overwriting the newer text. If no free 0.1s slot exists before the next event, the edit is rejected with a visible `EDIT` error instead of sliding into a different position. The layer is inert on the Setup tab — the recording surface stays a pure artifact and the native context menu stays available there.

**Preview vocabulary.** Two registers, kept distinct on purpose:

- **Move gestures** use editor-only marks that never appear in a recording: a 5px inset stroke on the origin square and the hovered legal target, a dot (r 13) on empty legal targets, a ring (r 40) on occupied ones. All take the coordinate-label ink pairing (steel-blue on cream squares, cream on blue squares), so they read on both square colors without adding a new hue to the Five Meanings.
- **Annotate gestures** preview the artifact itself: the exact amber highlight or persimmon arrow a release would record, at reduced opacity (0.5 / 0.55) so the preview reads as not-yet-committed. Same geometry, same plane (`zIndex: 3`) as the recorded overlays.

Cursor is `grabbing` during a move drag and `crosshair` during an annotate gesture. Mouse-only by design: right-button gestures need a mouse, and the tool is a desktop screen-recording workflow.

### Mind's-Eye Mode (`mind` … `reveal`)

The board as the narrator's mental sketch, for blindfold-style lessons. Between `mind` and `reveal` the squares sink to the void pair (`--mind-void-light` #101628 / `--mind-void-dark` #0f1526 — near-identical on purpose: the grid all but disappears), and orientation moves to the coordinates, which swap to a single bright ink (`--mind-coord-ink` #c8d0e6) at full legibility. Only pieces on squares the script has named render, on a forgetting curve: fresh at full strength for 1.5s, then fading to nothing by 8s — what isn't restated is forgotten. The exception is active tracking: a square under a currently-visible highlight or arrow endpoint (the pinned alarms) or a live check holds its piece at full strength for as long as the overlay lasts — the alarm is the rehearsal. Highlights, arrows, capture flash, and the check glow keep their normal vocabulary — in the void they carry all the light, which is the point: the sketch shows exactly what the narration is tracking. Alarms meant to persist across the sketch use the pinned forms (`hl f7 pin`, `c4->f7 pin`). `reveal` lifts the void with a 600ms fill transition while pieces fade up from darkness — the "open your eyes" beat. Both transitions collapse under `prefers-reduced-motion`.

## 6. Do's and Don'ts

### Do
- **Do** keep chrome in the four-stop tonal ladder: `rgba(255,255,255,α)` at α ∈ {0.04, 0.06, 0.10, 0.12}. Anything outside this set should be a primitive accent color, not chrome.
- **Do** set every numeric, every chess square, every SAN move, every script line in **JetBrains Mono**. Set every chrome label in **Schibsted Grotesk**.
- **Do** use the move/highlight/arrow/clear/reset color list for any event-related visual. The five hues are vocabulary, not decoration.
- **Do** keep functional motion (`piece slide`, `arrow draw`, `capture flash`) and cut everything else. Decorative hover pulses, gradient sweeps, shimmer effects: forbidden.
- **Do** clamp all chrome contrast to "quieter than the board". The board is the canvas. If chrome competes for attention in a screen recording, it is wrong.

### Don't
- **Don't** use the chess.com palette. No green-and-cream board, no chess.com red-and-yellow accent set. PRODUCT.md anti-reference, repeated here as a hard constraint.
- **Don't** ship the SaaS dashboard template. No hero-metric block, no identical icon-headline-blurb card grids, no gradient-accent CTAs scattered through the chrome. The system has exactly one gradient surface (Play); do not introduce a second.
- **Don't** ship toy-chess vibes. No oversize rounded everything, no candy palette, no XP bars, badges, mascots, or gamified rewards. Cap component radius at 16px (`rounded.xl`); do not exceed.
- **Don't** ship the glassy AI-tool reflex. No stacked translucent panels, no neon glows, no gradient-mesh hero, no decorative `backdrop-filter`. The two existing blurs (`controls` 6px, `side-col` 8px) are load-bearing because they float over the board's color; that is the ceiling.
- **Don't** introduce side-stripe borders as an accent device. Current event states use full-pill or full-row tinting plus dots and leading typographic contrast; they never grow a decorative side stripe. The textarea's `:focus-visible` strand is the one functional inset exception (single component, single focus state).
- **Don't** use `background-clip: text` for gradient text anywhere. Single-color text, with hierarchy carried by weight and size.
- **Don't** use modals as a first thought. The script editor lives in-panel, the event list lives in-panel; future affordances stay inline before they become modals.
- **Don't** pure-`#000` or pure-`#fff` anywhere. Stagewell Black (`#0f1525`) is the floor, Sodium Chalk (`#e8ecf5`) is the ceiling.
- **Don't** animate CSS layout properties. Pieces translate via `transform: translate3d(${f * 100}%, ${(7 - r) * 100}%, 0)` over a fixed origin, never via `left`/`top`. Animate `transform`, `opacity`, and `box-shadow` only. Easing curves are exponential ease-out (`cubic-bezier(0.5, 0, 0.2, 1)` for piece slides, `ease-out` for the rest); no bounce, no elastic, no spring.
