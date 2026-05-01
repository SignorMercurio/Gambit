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
[mm:ss] highlight d4,e4 # square highlight
[mm:ss] arrow f1->c4    # arrow (also accepts → or "to")
[mm:ss] clear           # clear annotations
[mm:ss] reset           # reset board to the current Start FEN
```

## Credits

Staunty chess piece SVGs by sadsnake1 via Lichess. See [LICENSE-pieces.txt](./LICENSE-pieces.txt).
