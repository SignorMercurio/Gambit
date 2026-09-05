# Gambit

A Vite + React chess timeline renderer for teachers and content creators: a
deterministic, recordable chess board driven by a small timestamped script.

Requires Node 20.19+ (or 22.12+). npm, no workspaces.

```sh
npm run dev        # Vite, usually http://127.0.0.1:5173/
npm test           # node scripts/test-regressions.mjs — not a test framework
npm run build
```

## The Invariant

Script text, Start FEN, and current time fully determine the board. Every feature
derives from those three; nothing caches a second copy of board state, and no surface
writes board state directly. If a change makes the same three inputs render two
different frames, the change is wrong.

Corollary: avoid introducing state managers, chess libraries, router layers, or new
dependencies unless the feature genuinely needs them.

## Docs

| Read this | When you are |
|---|---|
| [docs/architecture.md](docs/architecture.md) | finding where code lives, or restructuring a module |
| [docs/script-language.md](docs/script-language.md) | changing the parser, an event kind, or chess rules |
| [docs/editing.md](docs/editing.md) | changing board gestures, the Moves view, or the insert menu |
| [docs/playback.md](docs/playback.md) | changing the clock, subtitles, narration, or PNG export |
| [docs/design.md](docs/design.md) | changing anything visible |
| [docs/testing.md](docs/testing.md) | verifying, or handing work off |
| [docs/assets.md](docs/assets.md) | touching the piece SVGs |

[PRODUCT.md](PRODUCT.md) holds product intent and anti-references;
[DESIGN.md](DESIGN.md) holds the design system. Read both before broad UI work.
