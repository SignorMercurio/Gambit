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
npm run typecheck
npm run build
```

For local visual QA:

```sh
npm run dev
```

The dev server is usually Vite on `http://127.0.0.1:5173/`, but use the URL Vite prints if the port is busy.

## Code Map

- `src/App.tsx`: app orchestration, script state, playback clock, event snapshots, side panel, controls.
- `src/components/Board.tsx`: board rendering, pieces, highlights, arrows, coordinates, capture flash, annotation badges.
- `src/components/Piece.tsx`: piece image mapping.
- `src/lib/chess.ts`: minimal chess state engine, legal move generation, SAN parsing.
- `src/lib/timeline.ts`: timestamped script parsing. Short syntax is primary: `hl`, direct arrows like `f3->e5`, `cl`, `rs`, `br`, `ml`; legacy long commands remain accepted.
- `src/lib/tokens.ts`: JS/SVG-facing design tokens mirrored from CSS.
- `src/styles.css`: visual system and responsive layout.
- `public/pieces/*.svg`: Staunty chess pieces from Lichess.

## Engineering Rules

- Keep the app deterministic. Script text, Start FEN, and current time should fully determine the board.
- Prefer small, local changes. Avoid introducing state managers, chess libraries, router layers, or new dependencies unless the feature genuinely needs them.
- Preserve strict TypeScript cleanliness. `npm run typecheck` must pass.
- When changing parser behavior, return visible `TimelineEvent` errors rather than silently ignoring malformed script input.
- When changing chess behavior, add conservative validation rather than accepting ambiguous or typo-like SAN.
- Keep board coordinates, arrows, highlights, badges, and pieces in predictable stacking order. Coordinates must remain readable with enlarged pieces.
- Do not expose FEN or internal board metadata in the default user-facing playback surface unless the user explicitly asks for it.

## Design Rules

- This is a product tool, not a landing page. Do not add marketing sections, hero copy, decorative cards, or generic SaaS dashboard patterns.
- The board is the visual priority. Chrome should not compete with the board in a recording.
- Preserve the current color vocabulary: blue for moves, amber for highlights, persimmon for arrows, neutral for structural events, vermillion for errors/resets.
- Arrows and highlights must survive downscaled video. Test at the real board size, not just in code.
- Use stable dimensions for board overlays and transport controls so playback does not shift layout.
- Respect `prefers-reduced-motion`: decorative motion should reduce; functional piece movement can remain.

## Chess And Timeline Pitfalls

- SAN capture markers must match the resolved move. `Nxe5` should not resolve to quiet `Ne5`, and quiet SAN should not hide a capture.
- Timestamp parsing must never produce `NaN`; invalid timestamps should become script errors.
- Highlight and arrow square inputs should be validated before reaching `Board`.
- If script duration shrinks, clamp the current playback time to the new duration.
- `reset` should restore the initial board state and clear transient visuals such as capture flash, arrows, highlights, and last move.
- Branch/mainline snapshots should restore board state and overlays without mutating prior snapshots.

## Assets And Licensing

The chess pieces in `public/pieces/` are the Staunty set from Lichess by sadsnake1 under CC BY-NC-SA 4.0. Keep `LICENSE-pieces.txt`, `README.md`, and the footer attribution in sync if piece assets change.

## Review Checklist

Before handing off meaningful changes:

1. Run `npm run typecheck`.
2. Run `npm run build`.
3. For visual changes, refresh the local app and inspect the board at normal viewport size.
4. For parser or chess changes, test at least one valid input and one malformed input path.
5. Check that no unrelated generated files or `dist/` artifacts are included unless the user explicitly asked for them.
