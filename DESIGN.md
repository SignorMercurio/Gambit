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

Gambit looks like a dim post-production room. The room is in deep navy blue lit by three radials: a steel-blue key light pooled on the board column, a warm wash from the upper-left, a cool wash from the lower-right. The chess board is the lit subject in the middle of the desk; everything around it (transport controls, the script panel, the event list) is the kind of quiet chrome a colorist or sound editor lives inside. The board's cream squares read like paper under a key light. The pieces are Staunty SVG silhouettes, treated like physical objects with a soft drop shadow. Highlights and arrows are amber and persimmon, the colors annotation pens leave on a print, and they fade back out the way real pen ink wouldn't, because this is a recording, not a notebook.

The transport sitting under the board is a pro-grade timeline ruler, not a media-player widget: kind-colored marker pins above the rail, mono time-tick labels below, a vertical playhead strand crossing the whole console. Between the board and the ruler sits the subtitle track, shown when SRT cues are loaded.

The system rejects the chess.com palette everywhere it draws (no green-and-cream board, no the-app's red-and-yellow accents); the move-quality marks are the one sanctioned exception, scoped to that mark wherever it appears, and copy that treatment on purpose. It rejects glassy AI-tool surfaces, candy-colored chess apps for kids, and the SaaS hero-metric template. There is exactly one accent gradient in the entire UI (the Play button); every other accent is a single solid color. Body chrome is tonal: raised surfaces wash chalk-tinted alpha over the dark gradient (the panel and console washes stay under 7%), recessed wells (tab track, speed track, inputs) sink with stagewell-black alpha, and interactive states ride the four-stop white ladder (4%, 6%, 10%, 12%). Type contrast carries hierarchy more than color does.

Density is studied. The width tiers are three, not two: at ≥1381px the side panel rests at its `clamp(560px, 32vw, 620px)` column inside the centered workspace; from 1241px to 1380px the layout stays two-column but the workspace clamp releases to full width and the panel flexes into whatever the board leaves (568px down to 429px); only at ≤1240px does the panel stack under the board. The middle tier exists because holding the panel's 560px floor was the sole reason 1280×800 stacked, and stacked, it pushed the transport 889px down the page — first paint was a board and a header, which reads as a static image viewer rather than a tool. In all three tiers the recording artifact stays at its 720px design size on ordinary laptop heights: the panel is what yields, never the board. Width still caps it naturally on phones; only genuinely short desktop viewports (width ≥1081px and height ≤760px) opt into the 560px working fallback. At every other height the page may scroll rather than silently shrinking a recording frame into the 500px range. The ≤920px and ≤840px squeeze tiers tighten chrome only. The transport console spans the full workspace width beneath the board column and the side panel; the side panel breathes at 14px–24px gaps; the panel header has its own typographic scale (uppercase, compact, smaller than the body) so it never competes with the events below it. The cinematic, precise, chess-native triad from PRODUCT.md is the line: cinematic in the surface posture, precise in the monospaced numerics and the deterministic playback, chess-native in respect for files-and-ranks and SAN.

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

- **Markup Amber** (board stop `#ffd54f`, `~oklch(89% 0.16 95)`; marker stop `#f0b429`). The two board marks are distinguished by *form*, and — unusually for this palette — they sit on different stops. The automatic last move **floods** its two squares in the board stop: 42% alpha on cream, 52% on blue (below those the mix desaturates until it stops reading as amber, especially after a 480p downscale). The authored `hl` **rings** its square in the *marker* stop at full opacity, radius 43% of a square, stroked at 6%. A circle and not a rounded square — an outlined rounded rect restates the square's own geometry and therefore reads as the square being *selected*, which is UI language and survives any amount of thinning or softening. A circle does not echo the grid, so it reads as a mark drawn on top, and it is the shape chess players already know from ringing a square. The marker stop also carries the highlight pins and seek dots, so one authored highlight is the same value in all three places. Reads like a highlighter pen across a printed page.
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
- **Studio Vermillion** (`#cf5d5d`, `~oklch(58% 0.16 22)`). Reset-event marker, error-row accent, and the check glow under a checked king (a radial fade from 95% to 55% alpha, gone by the square edge; derived from the engine position, never from a `+` in the SAN). Derived light tints (`#ff7b7b`, `#ff9b9b`, `#ffb4b4`) carry line numbers, reset-row text, and error text — `--color-error-line`, `--color-reset-text`, and `--color-error-text` in `styles.css`.

### Named Rules

**The Five Meanings Rule.** Five colors carry semantic load: blue for moves, amber for highlights, persimmon for arrows, grey-mist for clears, vermillion for resets and errors. Every timeline marker pin, every seek dot, the scrub-fill, the last-move tint, the current-move pill, and current non-move indicators pull from this list. Don't introduce a sixth without a sixth event kind to attach it to.

**The One Gradient Rule.** The system has exactly one accent gradient: the 44×44 Play button (`linear-gradient(135deg, studio-steel-blue, deep-set-blue)`). The scrubber's fill is a tonal blue gradient internal to the timeline component and counts as part of the same affordance, not a second gradient. Board-layer functional visuals (the capture flash, the check glow) are radial fades of a single palette color; they are part of the recorded artifact, not chrome accents, and don't count against this rule. The side panel and console backgrounds (`--surface-panel`, `--surface-console`) are vertical chalk-alpha washes capped under 7% opacity — elevation treatment, not accents; they must stay subtle enough to read as flat surfaces on a 480p recording. Every other accent is a single solid hex. New components do not introduce accent gradients.

**The Annotation-Pens Rule.** Amber and Persimmon are not two colors; they are a pair, used together to imply a creator's two-pen toolkit. Highlights belong to Amber. Arrows belong to Persimmon. Don't cross them.

**The Derived-Alpha Rule.** `rgba(…)` literals in `styles.css` and SVG attributes that decompose to a named palette color at an alpha stop are derived stops, not new colors: the chalk tints (`--line-soft/faint`, `--rim-light`, the surface washes), the `--well-*` ladder (stagewell-black alphas), vermillion alphas (the chip-reject flash, the wavy error underline, the errors band), camera-highlight-blue focus tints, and the `#0f1525` `floodColor` on the board's SVG drop-shadows (stagewell-black as shadow ink). A literal that does **not** decompose to a palette color is a bug. New derived stops are fine; new base hues go through the palette.

## 3. Typography

**Display Font:** Schibsted Grotesk (with `ui-sans-serif, system-ui, sans-serif` fallback). Self-hosted variable font, weight range 400–900, latin subset (`public/fonts/schibsted-grotesk-var.woff2`).
**Mono Font:** Lilex (with `ui-monospace, monospace` fallback). Self-hosted variable font, weight range 100–700, latin subset (`public/fonts/lilex-var.woff2`). Both fonts are OFL-1.1; the notices ship in `public/licenses/LICENSE-fonts.txt`, which the license requires to travel with the files.

Both families load from `public/fonts/` via `@font-face` in `src/styles.css` and are preloaded in `index.html` — no network font hosts, so first paint doesn't depend on a CDN and the app keeps its voice behind blocked font hosts.

**Character:** Two voices, deliberate split. Schibsted Grotesk handles the chrome (the app title, the panel title, the tab labels) — a grotesque with sharp, subtly angled terminals that fit the precision-instrument identity while staying crisp at the 10.5–13px chrome sizes. Lilex handles everything chess and time related: the time-readout, the speed buttons, the script editor, the event list, the event-kind chips, the script-syntax hints, the footer. The pairing carries the principle that the script is a human-written artifact and should read like code, while the chrome reads like a tool.

Lilex is an IBM Plex Mono derivative, so its skeleton is flatter and more engineered than the mono it replaced, which suits "precise" better; its x-height is 94% of the previous face's, which costs a little at the 10.5px Label floor and is the number to re-check before that floor moves again. Its advance is 0.6em, identical to the previous face — the swap moved no layout, and the `min-width` on the time-readout and the 65–75ch cap below both still hold as written.

**Why not the obvious sans companions.** IBM Plex Sans is the designed sibling of Lilex's parent and is the wrong answer here for a measurable reason: its variable `wght` axis stops at 700, so it cannot set the 23px/800 wordmark at all. Geist and Public Sans both reach 800, but Geist is the current dev-tool default and swapping to it would trade a distinct voice for the reflex PRODUCT.md's anti-references exist to avoid. Schibsted stays: it already carries the wordmark, the mono/proportional split is the contrast axis, and Lilex's flatter terminals sit closer to Schibsted's temperature than the rounder face did.

**`font-display: block`, never `swap`.** Both files are local and preloaded, so the block period is unobservable, while `swap` licenses a fallback flash plus reflow at exactly the moment a creator may be recording. Correct-or-invisible beats wrong-then-shifted.

**CJK in the mono stack.** Lesson scripts are frequently Chinese and the latin subset holds no Han glyphs, so `--font-mono` carries a `Gambit Mono CJK` face between Lilex and the generics. It is `local()`-only (no CJK payload ships) and `unicode-range`-scoped to Han/kana, so latin never leaves Lilex. Its `size-adjust: 120%` is the grid: the mono cell is 0.6em, two cells are 1.2em, and a Han glyph is 1em square — 120% lands every Han character on exactly two latin cells, which is also the size CJK wants beside latin. `local()` matches PostScript/full names only, so plain family names are also listed behind it in the stack — as `--font-cjk`, which `--font-mono` reads and the subtitle cue reads too — as the guarantee on platforms whose PostScript names we can't verify; those lose the grid but keep a chosen face.

### Hierarchy
- **Display** (Schibsted, 800, 23px, line-height 1.1, letter-spacing 0): the "Gambit" wordmark in the header. The single largest label in the UI; nothing competes with it.
- **Headline** (Schibsted, 700, 13px, letter-spacing 0, uppercase): panel titles ("Script", "Setup"). Small and compact, set in caps. The size restraint is the point; this is a label, not a heading.
- **Title** (Schibsted, 700, 12.5px): tab labels and chrome button text. Its compact uppercase variant (11px / 700: section labels, the view toggle, the upload and present toggles) carries the same voice one size down. 11px, not a 10.5–11px range: the range was drift wearing a hedge, and the two values belong to different families — see The Two Small Sizes below.
- **Numeric** (Mono, 600/700, 12.5px): the time-readout (`00:14.0 / 00:33.5`). Bumped to 700 for the current time, 600 for the separator and total, color-graded by role. Monospaced so digit width is stable across frames; the readout never reflows during playback. Critical to the cinematic principle.
- **Body** (Mono, 500, 12.5px, line-height 1.7): the script editor textarea, the move list's mainline moves (13px/600; 15px/600 in the recording-focused Present readout), error rows. Line-height is generous (1.7) because the editor is a working surface; users read and write here.
- **Caption** (Mono, 500–600, 11.5px): the working-surface small tier — panel hints, the footer, the FEN input, variation flows, speed segments, inline error rows.
- **Label** (Mono, 500–700, 10.5px): the micro-metadata floor — time-tick labels, time chips, filenames, the move-number rail. 10.5px is the system's smallest type; anything smaller aliases on downscaled recordings.
- **Subtitle** (CJK-first stack ending in Schibsted, 600, 29px, line-height 1.36; 26px at ≤600px; 22px on the short desktop frame): the subtitle strip only. CJK-first because lesson scripts are frequently Chinese; sized to survive a 480p downscale. These sizes follow the recording frame rather than the chrome type scale.

### Named Rules

**The Mono-for-Chess Rule.** Anything chess-related (SAN, square coordinates, time codes, script lines) is set in Lilex. Anything chrome-related (the app title, panel titles, tab labels, button labels) is set in Schibsted Grotesk. The split is structural; do not mix.

This rule is also what keeps the clock frame-stable, and the reason no `font-variant-numeric: tabular-nums` appears anywhere: every family in `--font-mono` is monospaced, so the digits already share one advance. The property used to sit on `.time-readout` doing nothing, which implied the stability came from a declaration rather than from this rule.

**The Two Small Sizes.** 10.5px and 11px both exist and are not competing steps: **10.5px is the mono Label floor** (time-tick labels, time chips, filenames, the move-number rail — anything smaller aliases on downscaled recordings) and **11px is the sans compact Title** (section labels, the view toggle, the present toggles). They never meet, because the family decides which applies. A mono element at 11px or a sans element at 10.5px is drift, not a variant.

**Icon glyphs are not on the ramp.** A character used as an icon — `.insert-plus`'s `+` at 14px, `.pgn-x`'s `×` at 12px — is sized to sit optically inside its control (a 16px cell, a 44px button), not to a text tier. These are the only two, they are commented as such in `styles.css`, and a type-ramp scan will flag them; that flag is expected. Any *text* at 12px or 14px is drift and belongs on the ramp.

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

**The app opens paused.** The board is an authoring surface before it is a recording, and a script that starts moving on load means a returning author's first act is to catch it and scrub back. Playback is something you ask for — the transport, Space, or a seek. (This is also why the rewind button preserves the play state rather than forcing one.)

**Primary action (Play / Pause).** A 44×44 square button with a `linear-gradient(135deg, studio-steel-blue → deep-set-blue)` background, `studio-cream` glyph, 10px radius, brand-bloom shadow. Hover scales the button to 1.04 (transform, not layout); active scales to 0.96. The glyph swaps between play / pause / restart icons depending on state; the icon track stays at 22×22 inside the 44×44 container.

**Secondary action (Rewind, future ctrl-buttons).** A 36×36 square button, `rgba(255,255,255,0.06)` resting background, `rim-light-pewter` glyph, 10px radius. Hover lifts to `rgba(255,255,255,0.12)` and `sodium-chalk` glyph; no transform on hover. Used for non-primary transport actions. The rewind button returns the playhead to 0 while preserving the play state (paused stays paused), so it never duplicates the primary button's end-state replay.

**Speed selector.** A 4-button mono-font segmented group inside a recessed `stagewell-black` 28% track (10px radius, 1px `--line-faint` inset ring, 3px padding). Each segment is `5px 9px` padding, 5px radius (`rounded.xs`), default `foley-slate` text on transparent, active `sodium-chalk` text on `rgba(255,255,255,0.12)` background. Type is Lilex 11.5px / 600. Reads like a video editor's transport-rate selector.

**Move-sound toggle.** A single `SFX` button beside the speed selector, sharing its grid track: both are preferences about the recording rather than about the board, and a video editor keeps both on the transport. It takes the segmented control's states (resting `foley-slate` on transparent, lit `sodium-chalk` on `rgba(255,255,255,0.12)`) so "lit means on" reads the same as the rate selector one control over, and the compact toggle's geometry (30px, `rounded.sm`, `0 10px` padding) so no new size enters the system. Type is the sans compact Title (11px / 700, uppercase), not the speed segment's mono — the speed buttons are mono because `0.5×` is a numeric, while `SFX` is a chrome word. The segmented pair measures 5.3:1 resting and 9.6:1 lit. A transparent `::before` at `inset: -7px -4px` lifts the 30px box to a 44px target. The choice persists with the local draft, defaults to on, and stays visible in Present, because the click is part of the recording.

**Tab toggle (Script / Setup).** A full-width two-segment strip across the top of the side panel: recessed `stagewell-black` 24% track, 5px padding, 4px gap, 1px `--line-faint` bottom hairline. Each tab flexes to half the panel width, 40px min-height, `9px 12px` padding, 7px radius, Schibsted 12.5px / 700, default `#aab3cf` text; active `sodium-chalk` text on `rgba(255,255,255,0.10)` with a 1px `--line-faint` inset ring.

### Event-kind markers

Non-move events surface as kind-colored dots and pins rather than filled chips. Scrubber marker pins and the move list's seek dots share one saturated palette — `#5d8fc9` move, `#f0b429` highlight, `#f08c2e` arrow, `#9b9b9b` clear, `#cf5d5d` reset/error — pins resting at 0.85 opacity (1.0 on hover), dots dimmed at 0.5 until reached (0.95 after). The palette lives once in `markerColors` (`src/lib/tokens.ts`); the move-quality marks use the separate `annotationMarkColors` set (below).

**Kind is never color alone.** Each semantic family also carries a shape, decodable in grayscale. Pins: moves and `br`/`ml` are square-cut bars (2px hairline radius), highlight / arrow / `mind` / `reveal` are capsules, `cl` is a hollow capsule (an inset ring, matching its own seek dot), structural breaks and script errors (reset / `st` / `fen` / error lines) are pointed pennants, and `rp` is two stacked segments — all painted as background layers rather than by clipping, which would clip the button's enlarged hit target with it. The shapes live in `markerForms` (`src/lib/tokens.ts`) and reach CSS as `data-form`, so the vocabulary is a table the suite can check against `markerColors` rather than a selector list. `rp` earns its own form because it is the one kind that shares a color exactly: a replay is about moves, so it keeps move blue, which leaves shape as the only thing separating them. It had neither, and was the one place in this vocabulary where two kinds were identical. Frequency decides who yields, as always — a move is on every other line, a replay is rare and deliberate. Writing the table down surfaced a second collision the CSS had hidden: `cl`, `mind`, and `reveal` all wear grey-mist and all three were capsules. `mind`/`reveal` are two halves of one gesture and may look alike; `cl` is independent and takes the hollow. Dots: highlight squares off (1.5px radius), arrow points (a small triangle), clear hollows to a ring; moves need no dot — they are text.

### Containers (panels)

**Side panel** (`side-col`). 14px radius, `--surface-panel` chalk wash background, 1px `--line-soft` border, 8px backdrop-blur (load-bearing because the panel sits over the surface gradient and would feel weightless without it). It rides a 560–620px column (`clamp(560px, 32vw, 620px)`) and spans exactly the board + subtitle rows of the workspace grid, so its bottom edge aligns with the subtitle strip above the console. The panel carries `contain: size`: its height comes from the spanned rows, and its content must never push them.

**Controls strip** (`controls`). 14px radius, `--surface-console` chalk wash, 1px `--line-soft` border, 6px backdrop-blur, `14px 18px` internal padding, spanning the full workspace width beneath the board column and the side panel. The radius matches the side panel and the board, so the three primary surfaces read as a unified editing booth, not three separate cards.

**Panel header** (inside `side-col`). `16px 18px 13px` padding, 1px `--line-faint` bottom border, a faint `stagewell-black` 11% recess tint. Carries the Headline label plus a Body-mono hint on the Script page; the Setup header is the label alone.

### Inputs

**Script editor textarea.** Borderless transparent background; relies on its container (the side panel) for surface. Mono Body type (12.5px / 500 / 1.7 line-height), `16px 18px` internal padding, `sodium-chalk` text. The native focus outline is replaced by `:focus-visible { box-shadow: inset 2px 0 0 var(--color-camera-highlight-blue) }` so keyboard focus shows a left strand without disturbing layout. The lack of border is intentional: the editor is a working surface inside a documented panel, not a form field that needs distinguishing.

**Narration track.** The Setup page's last section imports a narration audio file (`accept="audio/*"`). Its object URL is session-only, while the bytes persist as a best-effort IndexedDB draft because audio blobs do not fit the localStorage drafts. The audio element is invisible and follows the playback clock: play/pause, seeks (0.25s drift snap), and the speed selector via `playbackRate`. Narration longer than the chess script extends playback duration, mirroring the subtitle rule. The clock stays the single source of truth; audio never drives the board. The filename may tail-truncate, the duration readout next to it never does.

### Signature Component: the Pro-Grade Timeline Ruler

The full controls row is the project's signature component, carrying "Pro-Grade Transport, not consumer playback" by itself. It is a 5-column grid: Play, Restart, time-readout, **timeline ruler (1fr)**, and a preferences pair (speed selector + move-sound toggle) sharing the last track. The ruler column is the visual centerpiece: a three-row sub-grid inside the same `controls` surface, stretching across the full workspace width, 6px backdrop-blur, mono numerics that never reflow.

The ruler stacks three rows over the rail:

- **Pin row (top, 18px)**. Kind-colored, kind-shaped marker buttons hang above the rail (shape vocabulary under Event-kind markers; script-error lines pin here too, as vermillion pennants). Each pin is 5×16 at rest, growing on hover/focus via `transform: scaleY(1.375)` — never a height animation — with a hairline 1px tail dropping 7px to the rail so the pin feels anchored. The pin layer rides above the transparent scrub input (`z-index: 5`, `pointer-events: none` on the layer, `auto` on the pins) so a pin click seeks its exact event instead of raw-scrubbing near it. Pins are real `<button type="button">` elements with `aria-label="Seek to mm:ss: <event raw>"`; a `::before` pseudo-element extends the hit area to ~44×44, reaching up into the console's free padding and stopping at the rail's top edge so pin targets never steal the rail's own scrub clicks. The row is a `role="toolbar"` with one roving tab stop: Tab enters once, ←/→/Home/End walk the pins, Tab leaves — dozens of pins never cost dozens of Tab presses.
- **Rail (middle, 6px)**. The same `tonal-white-08` track and `studio-steel-blue → camera-highlight-blue` linear-gradient fill as before. Pill radius (`999px`).
- **Tick row (bottom, 14px)**. Mono-numeric time labels (10.5px / 500, foley-slate; the Label-tier size floor, anything smaller aliases on downscaled recordings) at adaptive intervals: every 5s for scripts ≤30s, every 10s ≤60s, every 15s ≤90s, every 30s ≤180s, every 60s above. Each label is preceded by a 1px `tonal-white-10` tick mark hung above it, anchoring the ruler visually.
- **Playhead strand**. Above and across all three rows: a 1px-wide vertical line in `sodium-chalk` with a top-to-bottom alpha gradient (55% → 18%), capped at the rail center by a 14×14 sodium-chalk thumb wearing the Scrub-thumb halo. The strand reads at small recording resolutions; the thumb anchors precise scrub. The thumb's offset is derived, not tuned: `crown + padding + pin row + gap + half the rail`. Getting it wrong doesn't look broken, it *feels* broken — see below.

Native `<input type="range">` is rendered transparent and stretched over the entire ruler; click-and-drag works anywhere in the console (pins excepted — they seek exactly), and arrow keys move time at 1s steps via the global keyboard handler. Because every mouse scrub parks focus on the range, the range mirrors the transport keys itself (Space toggles, ←/→ step 1s); scrubbing must never leave the keyboard dead.

### Navigation

**Logo mark** (`public/gambit-mark.svg`). A Studio Cream pawn standing on one rank of a board, on a flat Set Indigo plate wearing the tonal-ladder rim light. A gambit is a pawn sacrifice, so the pawn is the product's name rather than a generic chess glyph. Three constraints shape it, and each one was a defect in the mark it replaced:

- **Flat.** No shell gradient, no radial keylight, no drop-shadow filter. The system allows exactly one gradient surface (Play), and a blur under 12px shapes only dirties the edges at the 44–52px this is ever drawn at. Depth comes from the Logo bloom on the `.logo` box, which is the documented lit-object treatment; the SVG must not restate it.
- **Flush with its shadow box.** The plate fills the whole viewBox at the same ~31% radius `.logo` uses, so the bloom hugs the art. Drawing the tile inset inside the viewBox leaves the CSS shadow haloing a shape that isn't there.
- **The rank is in the blue ramp, not the board's own cream-and-blue.** The cream pawn has to separate from what it stands on, and cream squares put a bright square under half its base. The rank is also phase-shifted half a square so the pawn stands centred on one square rather than straddling the line between two, and that square is the darker of the pair — the same "tune the pair against each other, not only against the backdrop" rule the board marks follow.

**Header and panel mode tabs.** The header keeps the wordmark on the left and a compact pair of quiet ghost actions on the right: **Export PNG** first, **Present** second. Export is a secondary output action, never a blue primary CTA; its disabled/exporting state stays in the same ghost vocabulary and the label confirms completion in place. The side panel begins with a full-width two-tab strip (Script / Setup): Script is the primary PGN editor surface, while Setup collects the set-once inputs (Start FEN, subtitles, narration audio). Already documented under Buttons → Tab toggle. The tab `<button>`s carry `role="tab"` + `aria-selected` with arrow-key focus-follows-selection; the active state hooks on `[aria-selected='true']`, not on a `.on` class.

**Present mode.** Present hides the header, editor panel, and footer without creating a second playback state. The same board and subtitle strip remain, while the same transport becomes a fixed bottom bar that fades together with the cursor after pointer idle during playback; pointer movement, touch/pen contact, or keyboard focus restores it, and **Exit** or Escape returns to editing. A terse **PNG** action exposes the same board exporter without growing a second toolbar. The floating bar is sized to the timeline, not to the board: `min(1080px, 92vw)`, deliberately wider than the 720px frame it sits under. Matching the frame bought nothing — the bar floats below the artifact and fades during playback — while the six control groups ate ~620px of it and left the scrubber 99px, roughly a second per pixel, with the tick labels overlapping into a smear. The timeline is the control that must survive; the speed group and PNG/PGN/Exit yield first. The artifact rides the **optical center of the space the bar leaves**: `.app` fills the viewport and centers, reserving the bar's 130px footprint (28px offset + 80px bar + the 22px gap rhythm) so "centered" can't mean "centered underneath the transport". `safe center` is load-bearing — on a window too short to seat both, it degrades to top-aligned and the page scrolls, rather than centering the overflow and putting the board's top edge above the scroll origin where nothing can reach it.

The bar only floats where the window can seat the whole frame above it. At ≤760px wide the four-row transport returns to its normal flow slot below the subtitle, and at ≤970px tall a two-band version does the same: transport and secondaries on top, timeline spanning its own full-width row underneath. This floor reserves room for a two-line subtitle cue. The same flow layout applies to the 560px short-desktop frame so two-line cues stay unobstructed. Compact viewports therefore cannot collapse the timeline, cover narration text, or sit on the board's first rank and file coordinates; opacity hiding still reserves the slot and never reflows the artifact. Its optional **PGN** toggle adds a narrow, read-only mainline list with no timestamps, annotations, variations, or edit affordances. The board keeps the authored 720px size (or the existing 560px fallback at desktop widths ≥1081px and heights ≤760px); Present never introduces a viewport-height shrink formula. On a window too narrow to seat that width, `minmax(0, var(--artifact-fit-width))` lets the board shrink with available width instead of overflowing into a center crop, while the optional PGN stacks below the board at ≤760px instead of squeezing it beside a fixed track.

**Board orientation.** Setup carries a quiet White / Black segmented control for the recording's point of view. White is the default and the choice persists with the local draft; Present inherits it without adding another control or state. Orientation is a pure view transform: script events, FEN state, SAN, playback, and world snapshots stay canonical, while every board layer — coordinates, pieces, motion, highlights, arrows, checks, capture flash, annotation badges, and gesture hit-testing — shares the same reversible screen-coordinate mapping. Switching is immediate rather than animated, and there is no timeline `flip` command.

**Board PNG export.** Export captures the currently rendered board root only — the node `Board` exposes through its forwarded ref and `App` hands to `downloadBoardPng` — at a fixed 1440×1440 output independent of browser zoom and the 720/560px working size. It includes every artifact layer visible at that playback instant — orientation, squares, coordinates, pieces and their current transforms, last-move tint, highlights, arrows, checks, capture flash, move-quality badge, and mind's-eye opacity — while excluding subtitles, PGN, transport chrome, and the editor-only gesture preview. The playback clock pauses for the DOM clone and resumes its prior state afterward, preventing a single PNG from mixing adjacent animation frames. Rounded corners remain transparent. The filename carries the captured timeline time to centiseconds.

### Subtitle Track

A centered caption strip directly under the board, max-width matched to the board column, showing the SRT cue active at the current time. Type follows the Subtitle scale above (CJK-first stack) and uses high contrast so it survives a 480p screen-recording downscale; a multi-line cue grows the row downward — the one grid row allowed to expand — rather than overlapping the board or the console. When no cue is active the strip keeps its reserved height but clears its text and framing (`.subtitle-strip.is-empty` drops the border and background), so the idle frame is invisible on a recording without shifting layout. The side panel spans exactly the board + subtitle rows, so its bottom edge lines up with the subtitle strip's, above the full-width console.

**A11y.** The strip carries `aria-live="polite" aria-atomic="true"`, so screen readers announce a cue when it changes without forcing focus.

**Mobile (≤600px).** The stable-dimensions rule serves screen recording, which does not happen on a phone: when no SRT is loaded at all, the subtitle track collapses (`.subtitle-strip.no-track { display: none }`) instead of pushing the transport down; with cues loaded it keeps its reserved height so playback never shifts layout. The board's corner radius also steps from 14px to 8px (`--board-radius`) so the rank-8 coordinate survives the corner clip at ~343px board sizes.

### PGN Move List (Script panel, Moves view)

The Script panel's Moves view renders the script as a PGN move list — the lichess analysis-panel convention restated in Gambit's chrome — instead of a flat one-event-per-row log:

- **Mainline rows.** A `[num 30px] [white 1fr] [black 1fr]` grid, number rail on `tonal-white-04`, every move in Lilex 13px/600. A row that resumes on Black's move after an interruption shows the PGN "…" placeholder in the White cell. Each cell carries the move, its annotation dots, and a right-aligned 10.5px mono time.
- **Variations.** A top-level `br … ml` block renders as an inset flow (`tonal-white-04` background, mono 11.5px, line-height 1.9): numbered move spans (`3.Bc4`, `3…Bc5`; the number reappears after any interruption), nested variations in parentheses, and a trailing `↩` that seeks to the `ml`. Move numbering derives from the position snapshots, so it stays correct across variations, FEN loads, and resets.
- **Non-move events.** Highlights, arrows, clears, and `rp` render as small kind-colored seek dots (same hues as the timeline pins) attached inline after the move they follow; tooltips carry time + body. Replay reuses move blue but squares off the dot (and stacks its timeline pin into two segments), so it reads as a move-family command rather than a new semantic color. Resets / `st` / `fen` are full-width vermillion section breaks; numbering restarts beneath them. Script errors stay loud as full rows.
- **States.** Reached events read at full strength, not-yet-reached ones sit dimmed, and the current position (the last reached event) wears a solid steel-blue pill — Five Meanings: move — mirroring lichess's current-move highlight. Every event-mapped element carries `data-evi={event index}` so the highlight and the follow-scroll work regardless of nesting. A move the snapshot builder rejected (illegal SAN, bad FEN) is flagged inline — error-tint ink plus a vermillion wavy underline and a tooltip — so a broken line is findable at a glance, not only in the errors band.
- **Errors are playhead-independent.** The errors band always reflects the complete script error collection, and error lines pin on the timeline ruler as vermillion pennants: an author paused at 0:00 sees the invalid move at 0:37. Error visibility must never depend on where the playhead happens to sit.
- **Errors read in script order, and the band sizes itself.** Errors accumulate in two passes — the parser's, then the world walk's — so their natural order is by stage: six broken lines came out L7, L3, L4, L5, L6, L8. `buildWorld` sorts by line before returning, because the band is read top-to-bottom against the text the author is about to fix, and `role="status"` announces it in that order too. The band shows three rows and collapses the rest behind a `Show N more` count; the old fixed 140px height turned six errors into a nested scroll region inside an already-scrolling panel, hiding the report it exists to make. Expanded, it still takes a 240px ceiling — but that scroll is one the user asked for. Cascades stay unlabeled on purpose: one bad move makes every later move illegal, and guessing which error is *causal* would put a confident wrong label on a correct report.

- **The teacher's mark and the tool's mark stopped looking alike.** The authored `hl` and the automatic last-move tint were both full-square amber floods, 3% of alpha apart (`0.55` vs `0.52` on blue). Each alpha had been tuned on its own for downscale legibility; nobody tuned them against *each other*, so in the recording — which is the entire product — a viewer could not tell "the tool moved a piece here" from "the teacher is pointing here". The Five Meanings rule governs hue and had nothing to say here, because both marks are legitimately amber. What settles it is the doctrine the seek dots and timeline pins already follow: **kind is never color alone.**

  Which mark changes form is decided by **frequency**, and getting that backwards is visible immediately. The last move marks two squares on *every* move, one of them usually empty; ringing those put a hard-edged box on every move of the recording, and a box around an empty origin square reads as a selection artifact rather than as chess. So the last move keeps its quiet conventional flood, and `hl` — rare, aimed, one square the author chose — takes the ring. That also reads correctly as *meaning*: a flood is ambient ("something happened here"), a ring points ("look at this"). Restraint is not weakness here; thin ink is more directed than a wash, not less, which is why the ring reads as more pointed than the 55% flood it replaced.

  The ring is a **circle**, and that is not a styling preference. The first attempt used a rounded-rect outline, which restates the square's own geometry and so reads as a selection widget — thinning it, softening the corners, and insetting it all failed to shake that, because the shape itself was the problem. A circle doesn't echo the grid, so it reads as ink laid on top of the square rather than a boundary belonging to it.

  The ring's **value** took three tries, and each wrong answer was a measurement I hadn't taken. Drawn in the board stop it looked weak on cream and fine on blue, which I first read as a brightness problem and treated by raising alpha; it wasn't. `#ffd54f` is nearly studio-cream's own luminance, so the ring measured **1.15:1** on cream against 2.16:1 on blue — the author's aimed mark was half-invisible on every second square, and no alpha fixes a hue that matches its ground. The fix is the **marker stop**: a step darker and more saturated, which is exactly the axis cream doesn't share. That lifts cream to **1.58:1** and settles blue at 1.81:1 — not just brighter, but *evener*, which matters more for a mark whose square the author doesn't choose.

  Full opacity is load-bearing rather than incidental. A translucent stroke takes on whatever it covers, so the same token composited to two different colors and needed a per-square-color alpha pair (0.72/0.88) purely to chase an olive drift on blue. Opaque, it is the same pen everywhere and one token replaces the pair. The value lands near the arrow's persimmon, which is fine: nothing confuses a circle with an arrow, and form separating them is the same doctrine that split this ring from the flood.
- **Subtitle size follows the recorded artifact.** The Subtitle scale above keeps cues readable after downscaling while leaving room in the reserved track. Short desktop frames use the smaller cue size to avoid an extra wrapped line. Present's floating-bar floor is measured against two-line cues in the browser because height-dependent page padding changes the clearance.
- **Present mode put the recording frame at the top edge of its own view.** On a 1210px-tall window the board sat at y=28 and the floating transport at y=1102, with 258px of dead navy between them. Nothing in the present-mode CSS was wrong on its own: hiding the header, panel, and footer plus fixing the transport simply left `.app` with a single in-flow child, and `.app` never had a height or an alignment because in edit mode the side panel and the in-flow console always filled the viewport for it. The gap was a property of the *combination*, which is why it survived the mode being built. Present now fills the viewport and centers the artifact in the space above the bar — the fix is alignment, never a shrink formula on `--artifact-fit-width`; the frame stays its authored 720px and the page scrolls when the window can't seat it.
- **The scrub thumb was the one part of the transport you couldn't drag.** Pressing the white disk and dragging did nothing; pressing the bare rail 10px below it scrubbed fine. The thumb was painted at y=18 in timeline coordinates while the rail center is at y=28 — its `top` had been "tuned" with an arithmetic that dropped the timeline's 2px padding and used half the row gap instead of the whole gap plus half the rail. Ten pixels put it inside the **pin row**, where the marker hit extensions (`z-index: 5`) sit above the scrub input (`z-index: 4`) so that clicking a pin seeks its exact event. Every pixel of the thumb was covered by a seek button. Nothing looked wrong — the disk still overlapped the rail visually — so the defect only existed in the one interaction the control exists for.

  Two things follow. The offset is now **derived in the CSS comment and re-derived in the regression guard** rather than pinned as a literal, because the failure mode is a row-height edit silently sliding the thumb back off the rail. And the pin's hit extension now stops above the *thumb*, not above the rail: a 14px thumb on a 6px rail overhangs it by 4px on each side, so "clears the rail" was never the same as "clears the control". Those 4px can't be recovered upward (the subtitle strip already wins above the extension's top edge), so the pin target becomes 40×45 instead of 44×45 — past the 24×24 floor either way, and between a pin and the scrubber the pin is the one that yields.
- **The panel header stopped repeating the tab.** `SCRIPT` sat one row under a tab that already read `Script`, and `SETUP` under `Setup` — a whole header band whose only content was its own label. Both headings stay in the DOM as `sr-only` (the Script one names the editor via `aria-labelledby`) and Setup drops the band entirely, which returns that height to the move list on a panel that is always short. What remains reads as controls, not chrome: the Moves / Text toggle anchors left, `Import` anchors right (`margin-left: auto`), and the transient `Undo` grows into the gap between them. Flush against the toggle, Import had been reading as a third view — `Moves | Text | Import` — rather than an action; and its arrival used to displace the toggle by 66px, moving a control out from under the cursor at the exact moment an author who just edited the board is most likely to reach for it.
- **Time chips: quiet from the token, not from a fade.** The chips carried `opacity: 0.9` on top of foley-slate. On the panel's own well that measured 4.64:1, but inside a variation's lighter `tonal-white-04` inset it fell to 4.18:1 — under the 4.5:1 body floor, on the smallest type in the system. Dropping the fade alone clears it (4.80:1 worst case) while keeping the same token: brightening to rim-light-pewter would have hit 9:1 and made timestamps compete with the moves they annotate. The restraint was always supposed to come from the 10.5px mono and the faint pill, not from spending contrast. Four editor controls (`pgn-mv`, `pgn-var-mv`, `pgn-ret`, the chip) also sat fractionally under the WCAG 2.5.8 24px floor — 23.5–23.8px, close enough to look intentional and not be. Transparent `::before` extensions lift each to 24px+ with no change to the visible pill or the row rhythm.
- **A board that accepts drags has to look like one.** The editable board rested at the default arrow cursor and swallowed any press it couldn't act on, so an author who grabbed the wrong piece got no cursor change on the way in and nothing at all on the way out — identical to a broken board. Squares that can start a move now show `grab` (`grabbing` and `crosshair` during a drag were already there; only the resting state was missing), and a refused press writes an `EDIT` row: `Can't move from e7 at 00:00.0: it's White to move.` The two refusals worth naming look the same on screen — a piece sits there and won't move — so the message distinguishes wrong-turn from no-legal-move rather than saying "can't". Empty squares stay silent in both channels: nothing there ever offered a drag, and annotating an ordinary click on empty board space would turn the band into noise.
- **A stuck export is a failure, not a state.** The PNG button's `Exporting…` is a spinner-with-no-timeout by default, and one observed here sat past 18s: playback stayed paused and the button stayed disabled for the rest of the session with nothing in the band to read, because a promise that never settles never runs the `finally` that would have restored either. A 15s ceiling over the whole operation turns that into the `Retry PNG` state the UI already had — vermillion, re-armed, with a `PNG` row in the errors band naming the timeout. The ceiling wraps every await (the frame wait, the exporter's dynamic import, the rasterize), because the first version guarded only the rasterize and the hang turned out to be above it — a guard on the wrong step reads as protection and provides none. The first unbounded await was the two-frame settle wait: `requestAnimationFrame` does not fire in a hidden or throttled tab, so it never resolved and the export never even started. It now races a 200ms timer — a tab that isn't painting has no layout to settle. That does not make a hidden-tab export succeed, because the DOM exporter itself will not rasterize while the tab is hidden (a plain 40px `div` hangs there too, so it is the library's constraint, not the board's); it means the 15s budget is spent on the real work and the failure is reported against the real cause rather than against a wait that could never finish. An abandoned export cannot be cancelled, so it is muzzled instead: if it settles late, its download is dropped rather than depositing a file stamped with a time the board left minutes ago.

**Editable mode.** The list is a structured editor behind a Moves / Text segmented toggle (speed-group pattern; Text is the fallback for comments and exotic edits, choice persisted like the drafts). Every timed event pairs with a click-to-edit time chip (mono 10.5px — the Label floor — on a faint `tonal-white-06` pill, so timestamps read as objects distinct from move numbers; input commits on Enter/blur, cancels on Escape, ↑/↓ nudges 0.1s; an unparseable value never rewrites the line and never vanishes silently — the chip flashes a vermillion fade, a pure color crossfade that stays under reduced motion) and a delete × that floats in as a corner badge on hover (stagewell-black disc, vermillion ring on hover) — it reserves no inline space, so the resting layout stays as compact as the read-only view. `br` gets no chip at all: its timestamp is ordering-only (the board looks identical for any value between the neighboring events), so exposing it would invite meaningless edits — only the `ml` side (the visible snap-back moment) is editable, via the `↩` chip and nested `)` chips. A variation block deletes as a whole via its own × at the block's top-right; `br`/`ml` never carry per-line deletes, so their pairing can't be half-deleted. Clicking a move still seeks, so the board previews the position being edited. The header hint is contextual: gesture help in Moves, line syntax in Text.

**Insert menu.** The editor could retime and delete but never create, so nine of twelve event kinds had no way in and `mind`/`reveal` — the most distinctive thing the product does — shipped in zero pixels. A dock at the bottom of the Moves view carries a 44px `+ Insert at <time>` trigger with a `/` key hint; it expands a panel upward **in the flow**, not as a popover: the panel column has the room, and an in-flow disclosure cannot be clipped by an ancestor's overflow. The eight commands that insert complete without an argument (`cl rs st br ml rp mind reveal` — `rp`'s per-move seconds are optional) lead the list as one-click rows — parser order would have put the three gesture kinds first and pushed `mind`/`reveal` below the scroll fold, which is exactly the burial the menu exists to undo. Below a rule, the four that need an argument are listed as static reference rows carrying their real route (drag, right-click, right-drag, Setup) in steel blue, so the menu doubles as the app's only syntax reference without ever inserting a line that would parse as an error. Rows wear the same kind-colored dot as the ruler pins and the seek dots, so a kind reads identically in all three places. Type starts at 12.5px rather than joining the 10.5/11.5px chrome around it: these rows are read as prose, once, by someone learning the language, and density that serves a move list works against a reference. Roving tabindex makes the whole list one Tab stop, opening moves focus to the first command, and Escape closes and returns focus to the trigger.

### Move-Quality Marks (`!!` / `!` / `?` / `??`)

chess.com's move-classification treatment, adopted outright. This is the one sanctioned exception to PRODUCT.md's chess.com anti-reference, scoped to this mark wherever it appears rather than to a surface; the reasoning is there, and the short version is that a badge is a legend, not a frame — most of this audience already reads this one, and being original there costs comprehension without buying identity.

- **Brilliant** `!!` `#1baca6` · **Great** `!` `#5c8bb0` · **Mistake** `?` `#ffa459` · **Blunder** `??` `#fa412d`

**The badge.** A disc of radius 23 (board units, SQ = 100) centred exactly on the destination square's top-right corner, so it straddles the boundary and half of it crosses onto the neighbouring squares. On the h-file and the 8th rank the centre clamps inward — to one radius plus a 4-unit margin from the edge, and no further — so the disc never leaves the 800-unit box; the PNG export rasterizes that same box, and an unclamped badge would ship sliced. `BadgeDisc` in `Board.tsx` owns the circle and returns the element rather than a props bag, the way `HlRing` does, so a rim is unrepresentable at a call site.

Two reasons the disc hangs off the corner rather than sitting inside the square, both about the recording: a contained badge lands on the head of the piece standing there, and a mark that breaks the grid reads as applied *to the move* rather than as one more thing painted on the square — the distinction between the author's judgment and the board's own state.

**No rim; the shadow is the edge.** The reference has no rim, and an earlier white halo was the wrong way to buy separation — it put a ring of Gambit's own making around a mark whose whole point is to be the borrowed one. That leaves the drop shadow (dy 3, σ 3.5, stagewell-black at 70%) as the disc's only edge, and it is deeper than an ordinary board shadow for a measured reason: `great`'s `#5c8bb0` is **1.08:1** against the dark square, effectively the same luminance, so on half the board the filter is the entire difference between a disc and a smudge. chess.com never meets this because their board is green and cream, so a blue badge never lands on a blue square; ours does on half of them. The value was picked by comparing 0.34 / 0.55 / 0.70 / 0.85 on the page — 0.34 left the circle's edge to guesswork on blue, 0.85 became a grey halo that reads as grime on cream, where the fills already have contrast to spare.

**The glyphs are set, not drawn.** Real characters in the chrome face (Schibsted Grotesk) at weight **700** — 44 units for a single mark, 30 with −1.5 tracking for a doubled one. Not the display 900 it started at: at the ~40px the disc renders, 900 closes the question mark's aperture and a doubled pair starts to fuse. A path-drawn version was tried and reverted; it traded a maintainable line for control the mark did not need. One risk it had removed is worth knowing — `<text>` inside the SVG that `html-to-image` clones rasterizes in the right face only when that face is loaded and embeddable — but both board fonts are self-hosted and preloaded, so the export has them.

**The move list is chrome and keeps body AA.** `annotationMarkColors` spreads the board fills and overrides only where the panel forces it, so "one mark, one color" stays the default and each exception costs a line with a number attached. The floor is 4.5:1 on the **worst** backdrop a mark renders against — a variation's inset (`#31384c`), which is lighter than the panel well every earlier reading was taken on: `great` → `#8fb6d8` (from 3.21), `blunder` → `#ff7f6d` (3.25), `brilliant` → `#2cb9b3` (4.16 — close enough to look right and still fail). `mistake` clears it unchanged at 5.95. The replica was asked for on the board; a color chosen to sit on a cream chess square has no reason to also govern 13px body text on a dark panel.

**The current row drops the color.** The deep-set-blue pill uses chalk for both SAN and quality marks, preserving text contrast; `.pgn-varnum` inherits the same ink. Nothing is lost: the `!!` / `??` still reads, and the board badge is showing the color full size at that exact moment. The four hexes live only in `annotationMarkColors`; the mark takes its color inline the way a seek dot takes `markerColors[kind]`, so there is no CSS custom property and no per-kind class for it to disagree with.

**The landing square takes the judgment.** An annotated move repaints its destination in the quality's own color (42% on cream, 58% on blue) instead of the last-move amber; the origin square keeps the amber. Two systems were painting one square, and the tool's automatic mark was sitting on top of the author's explicit judgment — frequency decides who yields, and an annotation is the rarest thing an author writes. The pair now reads directionally: where the move came from, and what it was worth. It also means the mark survives a crop that cuts the badge.

### Mainline Replay (`rp` / `replay`)

`rp` is a clock-derived recap, not a script expansion. At its timestamp the board reconstructs every successfully applied preceding top-level move, in source order, at 0.5 seconds per move unless `rp <seconds>` gives a different step (0.1–10 seconds, one decimal place, so recap frames stay on the decisecond grid). Moves inside any `br` / `ml` depth are omitted; `rs`, `st`, and valid `fen` events reset the reconstructed position but consume no replay slot. Overlays clear for the recap, the final frame is the same canonical mainline position, and the presentation PGN moves its current pill across the existing source moves without creating duplicate rows. Board gestures stay inert while a recap is running because the visible frame is historical rather than the authored position at the `rp` line.

Replay is rejected visibly when it has no eligible move, appears inside a variation, starts while `mind` is active, exceeds the playback ceiling, or cannot finish before the next authored event. An event exactly at the replay end is valid. The replay's end extends playback duration when it is the last authored command.

### Move List Follow-Scroll

While playback runs, the list tracks the playhead: whenever the most recently reached event changes, the list scrolls just enough to keep that element visible (`block: nearest` semantics, container-only, never the page; the target is found via its `data-evi` attribute). While paused the list never moves on its own — editing must not fight the scroll position. Manual reading also wins over following: a mouse pointer entering the list pauses the follow, leaving resumes it. Touch pointers do not pause it (no hover concept). This is the video-editor convention the transport already commits to; without it the current-move pill is invisible for the second half of any script longer than the panel.

### Board Gesture Layer (Script tab only)

With the Script tab active, the board accepts mouse gestures that write script lines: left-drag a piece for a SAN move, right-drag for an arrow, right-click for a highlight, each stamped at the playhead captured when the pointer goes down. The gesture keeps that pointer-down commit callback even if playback advances while the pointer is held, so the preview and script edit always resolve against the same position; if the script text itself changes before release, the stale gesture is rejected instead of overwriting the newer text. If no free 0.1s slot exists before the next event, the edit is rejected with a visible `EDIT` error instead of sliding into a different position. The layer is inert on the Setup tab — the recording surface stays a pure artifact and the native context menu stays available there.

**Preview vocabulary.** Two registers, kept distinct on purpose:

- **Move gestures** use editor-only marks that never appear in a recording: a 5px inset stroke on the origin square and the hovered legal target, a dot (r 13) on empty legal targets, a ring (r 40) on occupied ones. All take the coordinate-label ink pairing (steel-blue on cream squares, cream on blue squares), so they read on both square colors without adding a new hue to the Five Meanings.
- **Annotate gestures** preview the artifact itself: the exact amber highlight or persimmon arrow a release would record, at reduced opacity (0.5 / 0.55) so the preview reads as not-yet-committed. Same geometry, same plane (`zIndex: 3`) as the recorded overlays.

Cursor is `grabbing` during a move drag and `crosshair` during an annotate gesture. Mouse-only by design: right-button gestures need a mouse, and the tool is a desktop screen-recording workflow.

### Mind's-Eye Mode (`mind` … `reveal`)

The board as the narrator's mental sketch, for blindfold-style lessons. Between `mind` and `reveal` the squares sink to the void pair (`mindVoidLight` #101628 / `mindVoidDark` #0f1526 in `tokens.ts` — near-identical on purpose: the grid all but disappears), and orientation moves to the coordinates, which cross-fade to a single bright ink (`mindCoordInk` #c8d0e6) at full legibility. The sink is a void layer whose opacity is derived from the playback clock (`SINK_SECONDS` 0.6s from the event), never a CSS transition: a transition would run on wall time, so scrubbing across `mind` while paused would show a frame that depends on how the playhead arrived. That is why these three colors live in `tokens.ts` rather than as CSS custom properties. Only pieces on squares the script has named render, on a forgetting curve: fresh at full strength for 1.5s, then fading to nothing by 3s — what isn't restated is forgotten. The exception is active tracking, which holds a piece at full strength for as long as the tracking lasts. Two things track: the move currently on the board, held until the next move takes over — the gap between moves runs 4–12s, well past the curve, and the narration is still talking about that move, so without the hold the sketch would empty out between moves — and a square under a currently-visible highlight (the pinned alarm) or a live check, where the alarm is the rehearsal. Rehearsal that ends at a script event is released — the square is named again at that instant, so it fades over the normal curve instead of popping out: the outgoing move when the next one takes over, a pinned alarm when `cl` clears it, the checked king when a move answers the check. An unpinned highlight expires between events, where there is no instant to name, but it holds a piece for only its own 2.5s, so the step is small. Arrows hold nothing: a pinned attack line keeps its own light while the pieces at its endpoints fade, so a threat can outlive the memory of the attacker. Highlights, arrows, capture flash, and the check glow keep their normal vocabulary — in the void they carry all the light, which is the point: the sketch shows exactly what the narration is tracking. Alarms meant to persist across the sketch use the pinned forms (`hl f7 pin`, `c4->f7 pin`). `reveal` lifts the void over the same 600ms while pieces fade up from darkness — the "open your eyes" beat. Both ramps are functional state (they are the mode change, like a piece slide), so they stay under `prefers-reduced-motion`.

## 6. Do's and Don'ts

### Do
- **Do** keep chrome in the four-stop tonal ladder: `rgba(255,255,255,α)` at α ∈ {0.04, 0.06, 0.10, 0.12}. Anything outside this set should be a primitive accent color, not chrome.
- **Do** set every numeric, every chess square, every SAN move, every script line in **Lilex**. Set every chrome label in **Schibsted Grotesk**.
- **Do** use the move/highlight/arrow/clear/reset color list for any event-related visual. The five hues are vocabulary, not decoration.
- **Do** keep functional motion (`piece slide`, `arrow draw`, `capture flash`) and cut everything else. Decorative hover pulses, gradient sweeps, shimmer effects: forbidden.
- **Do** clamp all chrome contrast to "quieter than the board". The board is the canvas. If chrome competes for attention in a screen recording, it is wrong.

### Don't
- **Don't** use the chess.com palette anywhere. No green-and-cream board, no chess.com red-and-yellow accent set. PRODUCT.md anti-reference, repeated here as a hard constraint. The move-quality marks are the single carve-out — scoped to that mark, on any surface — and are already spent — don't read them as a precedent for the next surface.
- **Don't** ship the SaaS dashboard template. No hero-metric block, no identical icon-headline-blurb card grids, no gradient-accent CTAs scattered through the chrome. The system has exactly one gradient surface (Play); do not introduce a second.
- **Don't** ship toy-chess vibes. No oversize rounded everything, no candy palette, no XP bars, badges, mascots, or gamified rewards. Cap component radius at 16px (`rounded.xl`); do not exceed.
- **Don't** ship the glassy AI-tool reflex. No stacked translucent panels, no neon glows, no gradient-mesh hero, no decorative `backdrop-filter`. The two existing blurs (`controls` 6px, `side-col` 8px) are load-bearing because they float over the board's color; that is the ceiling.
- **Don't** introduce side-stripe borders as an accent device. Current event states use full-pill or full-row tinting plus dots and leading typographic contrast; they never grow a decorative side stripe. The textarea's `:focus-visible` strand is the one functional inset exception (single component, single focus state).
- **Don't** use `background-clip: text` for gradient text anywhere. Single-color text, with hierarchy carried by weight and size.
- **Don't** use modals as a first thought. The script editor lives in-panel, the event list lives in-panel; future affordances stay inline before they become modals.
- **Don't** pure-`#000` or pure-`#fff` anywhere. Stagewell Black (`#0f1525`) is the floor, Sodium Chalk (`#e8ecf5`) is the ceiling.
- **Don't** animate CSS layout properties. Pieces translate via `transform: translate3d(${f * 100}%, ${(7 - r) * 100}%, 0)` over a fixed origin, never via `left`/`top`. Animate `transform`, `opacity`, and `box-shadow` only. Easing curves are exponential ease-out (`cubic-bezier(0.5, 0, 0.2, 1)` for piece slides, `ease-out` for the rest); no bounce, no elastic, no spring.
