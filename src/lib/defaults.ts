export const DEFAULT_SCRIPT = `# Chess Timeline. Every command: the syntax hint in Text, or + in Moves.
# Move annotations: append !! ! ? ?? to any SAN to badge the destination square.
# Persistent overlays: append \`pin\` to hl or arrow — they stay on
# screen until the next cl, rs, st, or fen (no auto-fade).
# Set an explicit position mid-script with: [mm:ss] fen <full FEN>
[00:01] e4!
[00:02.5] hl e4
[00:04] e2->e4
[00:05.5] cl
[00:06] e5?
[00:07.5] Nf3
[00:09] f3->e5
[00:10.5] Nc6
# Variation: 3.Bc4 — the Italian Game
[00:12] br
[00:13.5] Bc4
[00:15] c4->f7
[00:16.5] Bc5
# Sub-variation: 4.b4 — the Evans Gambit
[00:18] br
[00:19.5] b4
[00:21] hl b4
[00:22.5] Bxb4??
[00:24] c3
[00:25] ml
# back to Italian after 3...Bc5; play the quiet 4.c3
[00:26] c3
[00:27] ml
# back to main line after 2...Nc6; play 3.Bb5 — Ruy Lopez proper
[00:28] Bb5
[00:29.5] hl a6,b5,c6
[00:31] a6
[00:32.5] Ba4!!
[00:34] Nf6
[00:35.5] O-O`;

export const DEFAULT_SUBTITLES = `1
00:00:00,000 --> 00:00:04,000
White starts with e4 and takes the center.

2
00:00:06,000 --> 00:00:09,000
Black answers e5, keeping the structure symmetrical.

3
00:00:12,000 --> 00:00:17,000
The line branches to the Italian Game and eyes f7.

4
00:00:18,000 --> 00:00:24,000
Evans Gambit adds tempo pressure with b4.

5
00:00:28,000 --> 00:00:35,000
Back to the Ruy Lopez: Bb5 asks Black a direct question.`;
