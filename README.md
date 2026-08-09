# Gambit

Chess timeline renderer. Replays a game from a timestamped script with annotations (highlights, arrows), synced SRT subtitles, a scrubber, custom FEN starts, and speed controls.

## Run

Requires Node.js 20.19+ (or 22.12+).

```sh
npm install
npm run dev
```

Open the URL Vite prints (typically http://localhost:5173).

## Script syntax

```
[mm:ss] e4!                 # SAN move; optional quality suffix: !!, !, ?, or ??
[mm:ss] hl d4,e4 pin        # highlight squares; optional pin lasts until cl/rs/st/fen
[mm:ss] f1->c4 pin          # arrow; pin is optional; also accepts →, "to", or "arrow"
[mm:ss] cl                  # clear annotations (also accepts "clear")
[mm:ss] rs                  # reset to the configured Start FEN (also accepts "reset")
[mm:ss] st                  # reset to the standard position (also accepts "start")
[mm:ss] fen <FEN>           # set a position (also accepts "setfen")
[mm:ss] br                  # enter a variation (also accepts "branch")
[mm:ss] ml                  # return to mainline (also accepts "mainline")
[mm:ss] mind                # enter the deterministic mind's-eye view
[mm:ss] reveal              # reveal the full board again
```

## Subtitles

Open the **Setup** tab to paste SRT text or import a `.srt` file. Subtitle cues use standard SRT time ranges and must be separated by a blank line:

```
1
00:00:01,000 --> 00:00:04,000
Central control is established.
```

## Credits

Staunty chess piece SVGs by sadsnake1 via Lichess. See the
[piece asset notice](./public/licenses/LICENSE-pieces.txt) (CC BY-NC-SA 4.0).
That license includes a NonCommercial restriction; confirm that it covers the
intended recording/distribution, or replace the piece set before commercial use.
