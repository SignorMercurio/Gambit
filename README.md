# Gambit

Chess timeline renderer. Replays a game from a timestamped script with annotations (highlights, arrows), a scrubber, custom FEN starts, and speed controls.

## Run

```sh
npm install
npm run dev
```

Open the URL Vite prints (typically http://localhost:5173).

## Script syntax

```
[mm:ss] e4              # SAN move
[mm:ss] hl d4,e4        # square highlight (also accepts "highlight")
[mm:ss] f1->c4          # arrow (also accepts →, "to", or old "arrow f1->c4")
[mm:ss] cl              # clear annotations (also accepts "clear")
[mm:ss] rs              # reset board to the current Start FEN (also accepts "reset")
[mm:ss] br              # enter variation (also accepts "branch")
[mm:ss] ml              # exit variation (also accepts "mainline")
```

## Credits

Staunty chess piece SVGs by sadsnake1 via Lichess. See [LICENSE-pieces.txt](./LICENSE-pieces.txt).
