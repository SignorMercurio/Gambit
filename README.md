# Gambit

Chess timeline renderer. Replays a game from a timestamped script with annotations (highlights, arrows), synced SRT subtitles, a scrubber, custom FEN starts, and speed controls.

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
[mm:ss] st              # reset board to the standard initial position (also accepts "start")
[mm:ss] fen <FEN>       # set board to a specific FEN (also accepts "setfen")
[mm:ss] br              # enter variation (also accepts "branch")
[mm:ss] ml              # exit variation (also accepts "mainline")
```

## Subtitles

Paste SRT text in the Script panel or upload a `.srt` file. Subtitle cues use standard SRT time ranges:

```
1
00:00:01,000 --> 00:00:04,000
Central control is established.
```

## Credits

Staunty chess piece SVGs by sadsnake1 via Lichess. See [LICENSE-pieces.txt](./LICENSE-pieces.txt).
