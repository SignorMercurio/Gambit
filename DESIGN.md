---
name: Gambit
description: Cinematic, scrubbable chess timeline for creators and teachers.
colors:
  studio-steel-blue: "#5d8fc9"
  deep-set-blue: "#3a64a0"
  camera-highlight-blue: "#7da9dc"
  studio-cream: "#f1ecde"
  markup-amber: "#ffd54f"
  annotation-persimmon: "#ffaa3c"
  stagewell-black: "#0f1525"
  stagewell-indigo: "#161e35"
  set-indigo: "#1f2a44"
  backdrop-slate: "#2a3556"
  sodium-chalk: "#e8ecf5"
  rim-light-pewter: "#c8d0e6"
  foley-slate: "#8d97b3"
  stage-mist: "#6b7596"
  studio-vermillion: "#cf5d5d"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "0"
  headline:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0"
  title:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "normal"
  numeric:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "normal"
  body:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "12.5px"
    fontWeight: 500
    lineHeight: 1.7
    letterSpacing: "normal"
  label:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "10.5px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0"
rounded:
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
    textColor: "#aab3cf"
    rounded: "{rounded.sm}"
    height: "40px"
    padding: "9px 12px"
  chip-marker-move:
    backgroundColor: "#5d8fc933"
    textColor: "#b8d0ec"
    rounded: "{rounded.xs}"
    padding: "3px 7px"
  chip-marker-highlight:
    backgroundColor: "#f0b42933"
    textColor: "#f0c869"
    rounded: "{rounded.xs}"
    padding: "3px 7px"
  chip-marker-arrow:
    backgroundColor: "#f08c2e33"
    textColor: "#f0a86b"
    rounded: "{rounded.xs}"
    padding: "3px 7px"
  chip-marker-clear:
    backgroundColor: "#9b9b9b33"
    textColor: "#c0c0c0"
    rounded: "{rounded.xs}"
    padding: "3px 7px"
  chip-marker-reset:
    backgroundColor: "#cf5d5d38"
    textColor: "#ff9b9b"
    rounded: "{rounded.xs}"
    padding: "3px 7px"
  now-playing-caption:
    backgroundColor: "#00000000"
    textColor: "{colors.sodium-chalk}"
    rounded: "{rounded.xs}"
    padding: "10px 6px 10px 0"
    height: "48px"
---

# Design System: Gambit

## 1. Overview

**Creative North Star: "The Editing Booth"**

Gambit looks like a dim post-production room. The room is in deep navy blue lit by three radials: a steel-blue key light pooled on the board column, a warm wash from the upper-left, a cool wash from the lower-right. The chess board is the lit subject in the middle of the desk; everything around it (transport controls, the script panel, the event list) is the kind of quiet chrome a colorist or sound editor lives inside. The board's cream squares read like paper under a key light. The pieces are Staunty SVG silhouettes, treated like physical objects with a soft drop shadow. Highlights and arrows are amber and persimmon, the colors annotation pens leave on a print, and they fade back out the way real pen ink wouldn't, because this is a recording, not a notebook.

The transport sitting under the board is a pro-grade timeline ruler, not a media-player widget: kind-colored marker pins above the rail, mono time-tick labels below, a vertical playhead strand crossing the whole console. Between the board and the ruler sit the subtitle track (when SRT cues are loaded) and the Now-Playing Caption, a slim mono strip that announces the active event so a viewer of a screen recording knows what just happened without seeing the side panel.

The system rejects the chess.com palette outright (no green-and-cream board, no the-app's red-and-yellow accents). It rejects glassy AI-tool surfaces, candy-colored chess apps for kids, and the SaaS hero-metric template. There is exactly one accent gradient in the entire UI (the Play button); every other accent is a single solid color. Body chrome is tonal: raised surfaces wash chalk-tinted alpha over the dark gradient (the panel and console washes stay under 7%), recessed wells (tab track, speed track, inputs) sink with stagewell-black alpha, and interactive states ride the four-stop white ladder (4%, 6%, 10%, 12%). Type contrast carries hierarchy more than color does.

Density is studied. The board sits at 720px on desktop and stays there on normal laptop-height viewports; it only scales down on severely short desktop windows, with a 560px floor, so the recording artifact does not unexpectedly collapse. The transport console spans the full workspace width beneath the board column and the side panel; the side panel rides a 560–620px column (`clamp(560px, 32vw, 620px)`) and breathes at 14px–24px gaps; the panel header has its own typographic scale (uppercase, compact, smaller than the body) so it never competes with the events below it. The cinematic, precise, chess-native triad from PRODUCT.md is the line: cinematic in the surface posture, precise in the monospaced numerics and the deterministic playback, chess-native in respect for files-and-ranks and SAN.

**Key Characteristics:**
- Dark navy backdrop with a steel-blue key-light pool centered on the board column. Cream-on-blue board, never reversed.
- Quiet tonal chrome. One gradient surface only (Play). One ambient drop shadow only (the board).
- Typography is the structural device: monospaced for anything numeric or chess-script, sans for chrome titles.
- Color marks meaning, not decoration. Move = blue, highlight = amber, arrow = persimmon, clear = grey-mist, reset/error = vermillion. These five hues drive every chip, marker, scrub-fill, last-move tint, active-row stripe, and Now-Playing rail.
- Pro-grade transport: marker pins above the rail, time-tick labels below, full-height playhead strand. The ruler is the signature component.
- Motion is functional and exponential. Pieces slide via `transform: translate3d`, arrows draw, captures flash. Nothing hovers or shimmers.

## 2. Colors: The Studio Palette

A cinematic dark-studio palette built around one structural blue, one warm cream, two warm annotation accents, and a shaded navy ramp the chrome rides on. OKLCH values below are eyeball-grade approximations; hex in the frontmatter is normative.

### Primary
- **Studio Steel Blue** (`#5d8fc9`, `~oklch(64% 0.10 256)`). The single load-bearing brand color. Lives in the board's dark squares, the Play-button gradient start, the active scrub-fill, the move-marker chip family, and the active-event indicator stripe. Saturated enough to read against the cream squares and the navy surface; restrained enough not to behave like a SaaS-blue accent.
- **Deep-Set Blue** (`#3a64a0`, `~oklch(48% 0.10 258)`). The Play-button gradient end and primary-hover state. Reads as the steel blue, one stop deeper.
- **Camera-Highlight Blue** (`#7da9dc`, `~oklch(72% 0.08 250)`). The scrub-fill gradient end and the move-marker chip text. The "lit-from-above" stop in the blue family.

### Secondary
- **Studio Cream** (`#f1ecde`, `~oklch(94% 0.02 80)`). The light squares, the logo glyph, the Play-button glyph. Warm enough to balance the cool navy, never `#fff`.

### Tertiary
- **Markup Amber** (`#ffd54f`, `~oklch(89% 0.16 95)`). User highlights and last-move tinting. Used at 55% alpha on the highlighted square, 32% alpha on the last-move tinting, 20% alpha as a chip background, and full saturation on the chip text. Reads like a highlighter pen across a printed page.
- **Annotation Persimmon** (`#ffaa3c`, `~oklch(79% 0.17 65)`). The arrow color, used at 85% alpha on the stroke, 20% alpha as a chip background. The bolder, warmer cousin of Amber. Together they form the "annotation pens" pair.

### Neutral
- **Stagewell Black** (`#0f1525`, `~oklch(13% 0.03 268)`). The body-gradient bottom; the deepest surface in the system.
- **Stagewell Indigo** (`#161e35`, `~oklch(18% 0.04 268)`). The body-gradient top.
- **Set Indigo** (`#1f2a44`, `~oklch(22% 0.04 263)`). The radial-gradient warm wash from the upper-left "off-stage light".
- **Backdrop Slate** (`#2a3556`, `~oklch(28% 0.05 268)`). The radial-gradient cool wash from the lower-right.
- **Sodium Chalk** (`#e8ecf5`, `~oklch(93% 0.012 261)`). Primary text on chrome.
- **Rim-Light Pewter** (`#c8d0e6`, `~oklch(83% 0.025 261)`). Secondary text, panel titles, ghost-button glyphs.
- **Foley Slate** (`#8d97b3`, `~oklch(63% 0.035 263)`). Muted text, panel hints, app-sub.
- **Stage Mist** (`#6b7596`, `~oklch(50% 0.04 263)`). Footer text, faintest event-time labels.

### Errors
- **Studio Vermillion** (`#cf5d5d`, `~oklch(58% 0.16 22)`). Reset-event marker, error chip background base. Used at 22% alpha for the reset marker, 30% alpha for the err chip, with derived light tints (`#ff7b7b`, `#ff9b9b`, `#ffb4b4`) for line numbers, error text, and reset-event chip text. The derivatives live in DESIGN.json's `colorMeta.studio-vermillion.tonalRamp`.

### Named Rules

**The Five Meanings Rule.** Five colors carry semantic load: blue for moves, amber for highlights, persimmon for arrows, grey-mist for clears, vermillion for resets and errors. Every chip, every timeline marker pin, the scrub-fill, the last-move tint, the active-event-row stripe and tint, and the Now-Playing rail pull from this list. Don't introduce a sixth without a sixth event kind to attach it to.

**The One Gradient Rule.** The system has exactly one accent gradient: the 44×44 Play button (`linear-gradient(135deg, studio-steel-blue, deep-set-blue)`). The scrubber's fill is a tonal blue gradient internal to the timeline component and counts as part of the same affordance, not a second gradient. The side panel and console backgrounds (`--surface-panel`, `--surface-console`) are vertical chalk-alpha washes capped under 7% opacity — elevation treatment, not accents; they must stay subtle enough to read as flat surfaces on a 480p recording. Every other accent is a single solid hex. New components do not introduce accent gradients.

**The Annotation-Pens Rule.** Amber and Persimmon are not two colors; they are a pair, used together to imply a creator's two-pen toolkit. Highlights belong to Amber. Arrows belong to Persimmon. Don't cross them.

## 3. Typography

**Display Font:** Plus Jakarta Sans (with `ui-sans-serif, system-ui, sans-serif` fallback). Loaded in weights 500/600/700/800.
**Mono Font:** JetBrains Mono (with `ui-monospace, monospace` fallback). Loaded in weights 400/500/600.

**Character:** Two voices, deliberate split. Plus Jakarta Sans handles the chrome (the app title, the panel title, the tab labels) with a slightly humanist warmth that keeps the chrome from feeling clinical. JetBrains Mono handles everything chess and time related: the time-readout, the speed buttons, the script editor, the event list, the event-kind chips, the script-syntax hints, the footer. The pairing carries the principle that the script is a human-written artifact and should read like code, while the chrome reads like a tool.

### Hierarchy
- **Display** (Jakarta, 800, 22px, line-height 1.1, letter-spacing 0): the "Gambit" wordmark in the header. The single largest label in the UI; nothing competes with it.
- **Headline** (Jakarta, 700, 13px, letter-spacing 0, uppercase): panel titles ("Events", "Script"). Small and compact, set in caps. The size restraint is the point; this is a label, not a heading.
- **Title** (Jakarta, 600, 13.5px): tab labels, controls labels, button text. Sits between Headline and Body in optical weight.
- **Numeric** (Mono, 600/700, 13px): the time-readout (`00:14 / 00:33`). Bumped to 700 for the current time, 600 for the separator and total, color-graded by role. Monospaced so digit width is stable across frames; the readout never reflows during playback. Critical to the cinematic principle.
- **Body** (Mono, 500, 12.5px, line-height 1.7): the script editor textarea, the event-list event body, error rows. Line-height is generous (1.7) because the editor is a working surface; users read and write here.
- **Label** (Mono, 700, 10.5px, letter-spacing 0, uppercase): the event-kind chips ("MOVE", "HIGHLIGHT", "ARROW", "CLEAR", "RESET"). Small, compact, in caps; functions as a typographic chip color in addition to its own background-tint chip color.

### Named Rules

**The Mono-for-Chess Rule.** Anything chess-related (SAN, square coordinates, time codes, script lines) is set in JetBrains Mono. Anything chrome-related (the app title, panel titles, tab labels, button labels) is set in Plus Jakarta Sans. The split is structural; do not mix.

**The Single-Display Rule.** The 22px Display weight appears once: the "Gambit" wordmark. Subheadings, page titles, modal titles do not graduate to Display. If a future surface needs a larger label, use Headline at a larger size before promoting to Display.

**The 65–75ch Cap.** The script editor textarea is the only place body type accumulates into long-form content. Line length there caps at the editor's natural panel width (560–620px column / ~70–78ch at the 12.5px mono — the 620px maximum brushes the cap's ceiling); on a wider viewport the editor stays in the side column rather than expanding further.

## 4. Elevation

Gambit uses tonal layering with one structural shadow, in three families:

1. **Raised container surfaces** are chalk-tinted washes, not flat whites: the side panel rides `--surface-panel` (vertical chalk alpha 5.8% → 2.8%) and the console rides `--surface-console` (6.2% → 3.4%). Hairlines come from `--line-soft` (7.5% chalk) for container borders and `--line-faint` (4.5% chalk) for internal dividers and inset rings; both raised surfaces wear a 1px `--rim-light` (6% chalk) top inset.
2. **Recessed wells** sink with `stagewell-black` alpha instead of lifting with white, via the `--well-08/11/20/24/28` ladder: the tab track (24%), the speed track (28%), text inputs (20%), the panel header tint (11%), the editor field sections (8%).
3. **Interactive states** keep the four-stop white ladder `rgba(255,255,255,α)`: **6%** for resting buttons (ghost icon button, upload button, count chip), **10%** for active states (active tab), **12%** for hover states (hovered ghost button on top of an already-active context); **4%** remains the floor for any future resting chrome that has no recess or wash of its own.

Behind the chrome, the body backdrop layers three radial-gradient washes over the navy linear: a tight `studio-steel-blue at 10%` key-light pool centered at `36% 48%` (under the board column); a `set-indigo` warm wash anchored at the upper-left corner; a `backdrop-slate` cool wash anchored at the lower-right. The result is that the board reads as physically lit, not just centered.

Two surfaces use a real `box-shadow`:

1. The board: `0 30px 80px -30px rgba(20, 30, 60, 0.55), 0 8px 24px -10px rgba(20, 30, 60, 0.30), inset 0 0 0 1px rgba(0, 0, 0, 0.05)`. A two-layer ambient shadow tinted toward the surface base, lifting the board off the studio floor. This is the only structural shadow in the system.
2. The Play button: `0 6px 16px -6px rgba(93, 143, 201, 0.7)`. A colored bloom under the only gradient surface in the UI. Not ambient shadow; brand glow tied to the brand color.

The active event row uses a 2px inset stripe to mark the current event, applied via `box-shadow: inset 2px 0 0 <kind-color>`. The stripe color follows the event kind under the Five Meanings Rule: blue for moves, amber for highlights, persimmon for arrows, grey-mist for clears, vermillion for resets / errors. Each stripe is paired with a low-alpha kind-tinted background (blue at 18%, amber/persimmon/grey at 13–14%, vermillion at 16%). It is intentionally a 2px inset shadow rather than a left-`border`, because it must not affect grid layout. The stripe is the only side-stripe accent in the system; future active-state indicators must reach for full-row tinting + leading typographic contrast first, and may use a 1px inset shadow at most.

### Shadow Vocabulary
- **Board ambient** (`0 30px 80px -30px rgba(20, 30, 60, 0.55), 0 8px 24px -10px rgba(20, 30, 60, 0.30), inset 0 0 0 1px rgba(0,0,0,0.05)`): the studio floor under the board. Use only on the board.
- **Brand bloom** (`0 6px 16px -6px rgba(93, 143, 201, 0.7)`): the colored bloom under the Play button. Use only on the single primary-action button at any one surface.
- **Scrub-thumb halo** (`0 0 0 4px rgba(93, 143, 201, 0.35), 0 2px 6px rgba(0, 0, 0, 0.4)`): the playhead disk. A 4px brand-tinted ring around a 14px sodium-chalk circle plus a small ground shadow. Use only on the timeline thumb.
- **Active row stripe** (`inset 2px 0 0 <kind-color>`): the current-event indicator inside the side panel's event list. Color resolves from the event kind under Five Meanings. The only side-stripe in the system; scoped to `.event-row.active`.
- **Playhead strand** (linear-gradient on `sodium-chalk` from 55% to 18% alpha, top-to-bottom): the vertical line crossing the timeline ruler. Not a `box-shadow`; the strand is a 1px-wide DOM element with a vertical alpha gradient. Reads at recording resolution.

### Named Rules

**The Tonal-First Rule.** Surfaces stack via translucent whites, not shadows. If a new surface needs to read as elevated, raise its `α` by one stop on the 4/6/10/12 ladder before considering a real shadow.

**The One-Bloom Rule.** Brand bloom (the colored shadow) is reserved for the single primary action on any given surface. Never decorate two adjacent buttons with bloom; never put bloom on a non-action surface.

## 5. Components

### Buttons

**Primary action (Play / Pause).** A 44×44 square button with a `linear-gradient(135deg, studio-steel-blue → deep-set-blue)` background, `studio-cream` glyph, 10px radius, brand-bloom shadow. Hover scales the button to 1.04 (transform, not layout); active scales to 0.96. The glyph swaps between play / pause / restart icons depending on state; the icon track stays at 22×22 inside the 44×44 container.

**Secondary action (Restart, future ctrl-buttons).** A 36×36 square button, `rgba(255,255,255,0.06)` resting background, `rim-light-pewter` glyph, 10px radius. Hover lifts to `rgba(255,255,255,0.12)` and `sodium-chalk` glyph; no transform on hover. Used for non-primary transport actions.

**Speed selector.** A 4-button mono-font segmented group inside a recessed `stagewell-black` 28% track (10px radius, 1px `--line-faint` inset ring, 3px padding). Each segment is `5px 9px` padding, 6px radius, default `foley-slate` text on transparent, active `sodium-chalk` text on `rgba(255,255,255,0.12)` background. Type is JetBrains Mono 11.5px / 600. Reads like a video editor's transport-rate selector.

**Tab toggle (Replay / Script).** A full-width two-segment strip across the top of the side panel: recessed `stagewell-black` 24% track, 5px padding, 4px gap, 1px `--line-faint` bottom hairline. Each tab flexes to half the panel width, 40px min-height, `9px 12px` padding, 7px radius, Jakarta 12.5px / 700, default `#aab3cf` text; active `sodium-chalk` text on `rgba(255,255,255,0.10)` with a 1px `--line-faint` inset ring.

### Chips (event-kind markers)

**Style:** `padding: 3px 7px`, 5px radius, mono uppercase Label type (10.5px / 700 / 0 letter-spacing). Each kind has a paired background-alpha + saturated-text:

- **Move:** `rgba(93, 143, 201, 0.20)` bg, `#b8d0ec` text.
- **Highlight:** `rgba(240, 180, 41, 0.20)` bg, `#f0c869` text.
- **Arrow:** `rgba(240, 140, 46, 0.20)` bg, `#f0a86b` text.
- **Clear:** `rgba(155, 155, 155, 0.20)` bg, `#c0c0c0` text.
- **Reset:** `rgba(207, 93, 93, 0.22)` bg, `#ff9b9b` text.
- **Error:** `rgba(207, 93, 93, 0.30)` bg, `#ffb4b4` text.

The chip color and the timeline marker color are linked: scrubber markers use the saturated parent color (`#5d8fc9`, `#f0b429`, `#f08c2e`, `#9b9b9b`, `#cf5d5d`) at 0.7 resting opacity, 1.0 on hover.

### Containers (panels)

**Side panel** (`side-col`). 14px radius, `--surface-panel` chalk wash background, 1px `--line-soft` border, 8px backdrop-blur (load-bearing because the panel sits over the surface gradient and would feel weightless without it). It rides a 560–620px column (`clamp(560px, 32vw, 620px)`) and spans the board, subtitle, and caption rows of the workspace grid, so its bottom edge aligns with the caption's divider. The panel carries `contain: size`: its height comes from the spanned rows, and its content must never push them.

**Controls strip** (`controls`). 14px radius, `--surface-console` chalk wash, 1px `--line-soft` border, 6px backdrop-blur, `14px 18px` internal padding, spanning the full workspace width beneath the board column and the side panel. The radius matches the side panel and the board, so the three primary surfaces read as a unified editing booth, not three separate cards.

**Panel header** (inside `side-col`). `16px 18px 13px` padding, 1px `--line-faint` bottom border, a faint `stagewell-black` 11% recess tint. Carries the Headline label plus either a Body-mono hint (Script) or a mono count chip (Events).

### Inputs

**Script editor textarea.** Borderless transparent background; relies on its container (the side panel) for surface. Mono Body type (12.5px / 500 / 1.7 line-height), `16px 18px` internal padding, `sodium-chalk` text. The native focus outline is replaced by `:focus-visible { box-shadow: inset 2px 0 0 var(--color-camera-highlight-blue) }` so keyboard focus shows a left strand without disturbing layout. The lack of border is intentional: the editor is a working surface inside a documented panel, not a form field that needs distinguishing.

### Signature Component: the Pro-Grade Timeline Ruler

The full controls row is the project's signature component, carrying "Pro-Grade Transport, not consumer playback" by itself. It is a 5-column grid: Play, Restart, time-readout, **timeline ruler (1fr)**, speed selector. The ruler column is the visual centerpiece: a three-row sub-grid inside the same `controls` surface, stretching across the full workspace width, 6px backdrop-blur, mono numerics that never reflow.

The ruler stacks three rows over the rail:

- **Pin row (top, 18px)**. Kind-colored marker buttons hang above the rail. Each pin is 5×16 at rest (5×22 on hover/focus), with a hairline 1px tail dropping 7px to the rail so the pin feels anchored. Pins are real `<button type="button">` elements with `aria-label="Seek to mm:ss: <event raw>"`, and a `::before` pseudo-element extends the hit area to 44×44 to clear WCAG 2.5.5 without disturbing visual rhythm.
- **Rail (middle, 6px)**. The same `tonal-white-08` track and `studio-steel-blue → camera-highlight-blue` linear-gradient fill as before. Pill radius (`999px`).
- **Tick row (bottom, 14px)**. Mono-numeric time labels at adaptive intervals: every 5s for scripts ≤30s, every 10s ≤60s, every 15s ≤90s, every 30s ≤180s, every 60s above. Each label is preceded by a 1px `tonal-white-10` tick mark hung above it, anchoring the ruler visually.
- **Playhead strand**. Above and across all three rows: a 1px-wide vertical line in `sodium-chalk` with a top-to-bottom alpha gradient (55% → 18%), capped at the rail center by a 14×14 sodium-chalk thumb wearing the Scrub-thumb halo. The strand reads at small recording resolutions; the thumb anchors precise scrub.

Native `<input type="range">` is rendered transparent and stretched over the entire ruler; click-and-drag works anywhere in the console, and arrow keys move time at 1s steps via the global keyboard handler.

### Navigation

**Panel mode tabs.** A full-width two-tab strip at the top of the side panel (Replay / Script); the header itself carries only the wordmark. Already documented under Buttons → Tab toggle. The tab `<button>`s carry `role="tab"` + `aria-selected` with arrow-key focus-follows-selection; the active state hooks on `[aria-selected='true']`, not on a `.on` class.

### Now-Playing Caption

A slim mono strip under the board (below the subtitle track), max-width matched to the board column. Announces the active event in type large enough (13.5px mono) to survive a 480p screen-recording downscale, so a viewer of the recording knows what just happened without seeing the side panel. Recordable-by-Default principle made physical.

**Layout.** A 4-column grid: `[stripe 4px] [time 11px mono] [kind chip] [body 1fr]`. Padding `10px 6px 10px 0`, fixed height 48px via `--now-playing-height` (42px on viewports under 920px tall), closed by a `--line-faint` bottom border. It sits below the subtitle track, above the console.

**State.** Two states:

- **Active**: an event has fired within the last 2.5 seconds. The stripe (4×22 rounded rectangle) takes its color from the event kind under Five Meanings (`var(--color-studio-steel-blue)` for move, `var(--color-markup-amber)` for highlight, etc.). The time label, kind chip, and body text render at full opacity. Body text resolves to `e.san` for moves, `${from} → ${to}` for arrows, the comma-joined squares for highlights, "cleared annotations" for clear, "board reset" for reset.
- **Idle**: no event in the last 2.5 seconds. The strip keeps its 48px frame but empties completely — text, stripe, and divider all clear (`:empty` turns the border transparent), so the idle frame is invisible on a recording.

**A11y.** The strip carries `role="status" aria-live="polite" aria-atomic="true"`, so screen readers announce kind + body when the active event changes without forcing focus.

## 6. Do's and Don'ts

### Do
- **Do** keep chrome in the four-stop tonal ladder: `rgba(255,255,255,α)` at α ∈ {0.04, 0.06, 0.10, 0.12}. Anything outside this set should be a primitive accent color, not chrome.
- **Do** set every numeric, every chess square, every SAN move, every script line in **JetBrains Mono**. Set every chrome label in **Plus Jakarta Sans**.
- **Do** use the move/highlight/arrow/clear/reset color list for any event-related visual. The five hues are vocabulary, not decoration.
- **Do** keep functional motion (`piece slide`, `arrow draw`, `capture flash`) and cut everything else. Decorative hover pulses, gradient sweeps, shimmer effects: forbidden.
- **Do** clamp all chrome contrast to "quieter than the board". The board is the canvas. If chrome competes for attention in a screen recording, it is wrong.

### Don't
- **Don't** use the chess.com palette. No green-and-cream board, no chess.com red-and-yellow accent set. PRODUCT.md anti-reference, repeated here as a hard constraint.
- **Don't** ship the SaaS dashboard template. No hero-metric block, no identical icon-headline-blurb card grids, no gradient-accent CTAs scattered through the chrome. The system has exactly one gradient surface (Play); do not introduce a second.
- **Don't** ship toy-chess vibes. No oversize rounded everything, no candy palette, no XP bars, badges, mascots, or gamified rewards. Cap component radius at 16px (`rounded.xl`); do not exceed.
- **Don't** ship the glassy AI-tool reflex. No stacked translucent panels, no neon glows, no gradient-mesh hero, no decorative `backdrop-filter`. The two existing blurs (`controls` 6px, `side-col` 8px) are load-bearing because they float over the board's color; that is the ceiling.
- **Don't** introduce side-stripe borders as an accent device. The active event row's `inset 2px 0 0 <kind-color>` shadow (color resolved per event kind under Five Meanings) is the only side-stripe in the system; it stays scoped to that row. New active-state indicators reach for full-row tinting + leading typographic contrast (and a leading chip / numeric prefix) before any side stripe. The textarea's `:focus-visible` strand follows the same shape (1px inset shadow) and the same constraint (single component, single state).
- **Don't** use `background-clip: text` for gradient text anywhere. Single-color text, with hierarchy carried by weight and size.
- **Don't** use modals as a first thought. The script editor lives in-panel, the event list lives in-panel; future affordances stay inline before they become modals.
- **Don't** pure-`#000` or pure-`#fff` anywhere. Stagewell Black (`#0f1525`) is the floor, Sodium Chalk (`#e8ecf5`) is the ceiling.
- **Don't** animate CSS layout properties. Pieces translate via `transform: translate3d(${f * 100}%, ${(7 - r) * 100}%, 0)` over a fixed origin, never via `left`/`top`. Animate `transform`, `opacity`, and `box-shadow` only. Easing curves are exponential ease-out (`cubic-bezier(0.5, 0, 0.2, 1)` for piece slides, `ease-out` for the rest); no bounce, no elastic, no spring.
