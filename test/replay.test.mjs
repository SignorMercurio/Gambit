// `rp`: mainline replay frames derived from the walk and the playback clock.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load, worldWithEvents, worldFrom, rowText } from './support.mjs';

const { parseScript } = await load('/src/lib/timeline.ts');
const { buildMainline } = await load('/src/components/PresentationMoves.tsx');
const {
  REPLAY_STEP_SECONDS,
  buildWorld,
  setupFromFen,
  worldFrameAt,
} = await load('/src/lib/world.ts');
const { playbackDuration } = await load('/src/lib/playback.ts');
const { moveSoundKey } = await load('/src/lib/moveSound.ts');
const Chess = await load('/src/lib/chess.ts');

test('a setup before rp holds its position, and replay ends on the last move', async () => {
  for (const setup of ['st', 'rs', 'reset', `fen ${Chess.STARTING_FEN}`]) {
    const build = worldFrom(`[1] e4\n[2] ${setup}\n[10] rp\n[12] hl d4\n[13] e5\n[15] rp`);
    assert.deepEqual(build.scriptErrors, []);
    const finalMove = build.snapshots[1].chessState;
    for (const time of [2, 5, 9.99]) {
      assert.equal(worldFrameAt(build, 1, time).snapshot.chessState.fen, Chess.STARTING_FEN,
        'reset holds the initial position throughout the explanation pause');
    }
    assert.equal(worldFrameAt(build, 2, 10.25).snapshot.chessState, finalMove);
    for (const time of [10.5, 11]) {
      const frame = worldFrameAt(build, 2, time);
      assert.equal(frame.snapshot.chessState, finalMove, 'replay settles on its last move, not a trailing reset');
      assert.equal(frame.replaySourceEventIndex, null);
      assert.equal(moveSoundKey(frame.snapshot.lastMove),
        moveSoundKey(worldFrameAt(build, 2, 10.25).snapshot.lastMove));
    }
    assert.equal(worldFrameAt(build, 3, 12.1).snapshot.chessState, finalMove);
    const repeated = worldFrameAt(build, 5, 16).snapshot;
    assert.equal(repeated.chessState, build.snapshots[5].chessState);
    assert.equal(Chess.board(repeated.chessState)[3][4]?.side, 'w');
    for (const [id, piece] of Object.entries(build.snapshots[5].positions)) {
      assert.equal(repeated.positions[id].f, piece.f);
      assert.equal(repeated.positions[id].r, piece.r);
      assert.equal(repeated.positions[id].captured, piece.captured,
        'moves after replay and later replays share the same restored board');
    }
  }
});

test('replay keeps the precision of its authored start', async () => {
  const preciseReplay = worldFrom('[1] e4\n[3.06] rp\n[3.56] cl');
  assert.deepEqual(preciseReplay.scriptErrors, []);
  assert.equal(worldFrameAt(preciseReplay, 1, 3.07).snapshot.lastMove.t, 3.06);
  assert.equal(preciseReplay.replaySequences.get(1).end, 3.56);
  assert.match(
    worldFrom('[1] e4\n[3.04] rp\n[3.52] cl').scriptErrors[0].error,
    /needs 0\.5s/i,
  );
});

test('decimal steps neither invent nor hide an overlap', async () => {
  for (const [start, step, end] of [[0.1, 0.2, 0.3], [0.01, 0.1, 0.11]]) {
    const exact = worldFrom(`[0] e4\n[${start}] rp ${step}\n[${end}] cl`);
    assert.deepEqual(exact.scriptErrors, [], 'decimal rounding does not invent an overlap');
    assert.equal(worldFrameAt(exact, 1, end).replaySourceEventIndex, null);
    assert.ok(worldFrom(`[0] e4\n[${start}] rp ${step}\n[${end - 0.02}] cl`).scriptErrors.length);
  }
  const decimalSteps = worldFrom('[0] e4\n[0.1] e5\n[0.7] rp 0.1');
  assert.equal(worldFrameAt(decimalSteps, 2, 0.8).replaySourceEventIndex, 0);
  assert.equal(worldFrameAt(decimalSteps, 2, 0.80001).replaySourceEventIndex, 1);
});

test('replay covers applied mainline moves and nothing inside br/ml', async () => {
  const { events: replayEvents, world: replayWorld } = worldWithEvents(
    '[1] e4\n[2] br\n[3] e5\n[4] ml\n[5] c5\n[10] rp',
  );
  assert.equal(REPLAY_STEP_SECONDS, 0.5);
  assert.deepEqual(replayWorld.scriptErrors, []);
  assert.equal(replayWorld.visualEndTime, 11);
  assert.deepEqual(
    replayWorld.replayFrames.map((frame) => frame.sourceEventIndex),
    [0, 4],
    'replay includes applied mainline moves and excludes every move inside br/ml',
  );
  const replayFirst = worldFrameAt(replayWorld, 5, 10);
  assert.equal(replayFirst.replaySourceEventIndex, 0);
  assert.equal(
    worldFrameAt(replayWorld, 5, 10.5).replaySourceEventIndex,
    0,
    'the exact paused-seek boundary still shows the first replay move',
  );
  assert.equal(worldFrameAt(replayWorld, 5, 10.5001).replaySourceEventIndex, 4);
  assert.equal(worldFrameAt(replayWorld, 5, 11).replaySourceEventIndex, null);
  assert.strictEqual(
    worldFrameAt(replayWorld, 5, 10.75).snapshot,
    worldFrameAt(replayWorld, 5, 10.75).snapshot,
    'scrubbing to the same replay time selects the same immutable frame',
  );
  assert.deepEqual(
    buildMainline(
      replayEvents,
      replayWorld.snapshots,
      replayWorld.rejectedEventIndexes,
    ).rows.map(rowText),
    [[1, 'e4', 'c5']],
    'the replay directive never duplicates moves in the presentation PGN',
  );
});

test('the event after a replay builds on its end position', async () => {
  // Stale pre-replay walk state would typecheck clean, so it is asserted here.
  const afterReplay = worldFrom('[1] e4\n[2] hl e4 pin\n[3] rp\n[8] hl d4');
  assert.deepEqual(afterReplay.scriptErrors, []);
  const settled = worldFrameAt(afterReplay, 2, 4).snapshot;
  const settledBoard = Chess.board(settled.chessState);
  assert.equal(settledBoard[3][4]?.side, 'w', 'the replayed move survives the replay');
  assert.equal(settledBoard[1][4], null, 'and the pawn is not still on its origin');
  assert.deepEqual(settled.highlights, [], 'replay clears overlays, pinned ones included');
  const nextEvent = worldFrameAt(afterReplay, 3, 8.1).snapshot;
  assert.equal(
    Chess.board(nextEvent.chessState)[3][4]?.side,
    'w',
    'the event after a replay builds on the position the replay ended at',
  );
  assert.deepEqual(
    nextEvent.highlights.map((h) => h.sq),
    ['d4'],
    'and adds to the cleared overlay set rather than a stale one',
  );
});

test('replay honors setups between moves', async () => {
  const replayAcrossSetups = worldFrom('[1] e4\n[2] st\n[3] d4\n[5] replay');
  assert.equal(replayAcrossSetups.replayFrames.length, 2);
  const afterResetMove = Chess.board(replayAcrossSetups.replayFrames[1].state.chessState);
  assert.equal(afterResetMove[1][4]?.side, 'w', 'st restores the e-pawn before the next replay move');
  assert.equal(afterResetMove[3][3]?.side, 'w', 'the post-setup d4 move is still replayed');
});

test('replay skips rejected moves', async () => {
  const replayAfterRejectedMove = worldFrom('[1] e5\n[2] e4\n[5] rp');
  assert.deepEqual([...replayAfterRejectedMove.rejectedEventIndexes], [0]);
  assert.deepEqual(
    replayAfterRejectedMove.replayFrames.map((frame) => frame.sourceEventIndex),
    [1],
    'moves rejected by the canonical world walk are not revived by replay',
  );
});

test('a replay that overlaps the next event is rejected', async () => {
  const overlappingReplay = worldFrom('[1] e4\n[2] e5\n[3] rp\n[3.5] Nf3');
  assert.equal(overlappingReplay.replaySequences.size, 0);
  assert.match(overlappingReplay.scriptErrors.find((error) => error.line === 3).error, /needs 1\.0s/i);
});

test('replay needs at least one mainline move', async () => {
  const emptyReplay = worldFrom('[1] rp');
  assert.match(emptyReplay.scriptErrors[0].error, /at least one applied mainline move/i);
});

test('rp <seconds> sets the step on the decisecond grid', async () => {
  // Frame times are integer deciseconds: in floats 0.8 * 5 overshoots 4.0 and
  // would reject a replay ending exactly on the next event.
  const { events: steppedReplayEvents, world: steppedReplay } = worldWithEvents(
    '[1] e4\n[2] e5\n[3] Nf3\n[4] Nc6\n[5] Bb5\n[10] rp 0.8\n[14] cl',
  );
  assert.equal(steppedReplayEvents.find((e) => e.kind === 'replay').step, 0.8);
  assert.deepEqual(
    steppedReplay.scriptErrors,
    [],
    'a stepped replay ending exactly on the next timestamp is valid',
  );
  const steppedSequence = steppedReplay.replaySequences.get(5);
  assert.equal(steppedSequence.step, 0.8);
  assert.equal(steppedSequence.end, 14);
  assert.equal(worldFrameAt(steppedReplay, 5, 10.9).snapshot.lastMove.t, 10.8);
  assert.equal(worldFrameAt(steppedReplay, 5, 10.8).replaySourceEventIndex, 0);
  assert.equal(
    worldFrameAt(steppedReplay, 5, 11.9).snapshot.lastMove.t,
    11.6,
    'frame selection honors the directive step, not the 0.5s default',
  );
  const bareReplaySequence = worldFrom('[1] e4\n[2] e5\n[10] rp').replaySequences.get(2);
  assert.equal(bareReplaySequence.step, REPLAY_STEP_SECONDS, 'bare rp keeps the 0.5s default');
});

test('replay is rejected inside a variation and during mind', async () => {
  const branchReplay = worldFrom('[1] e4\n[2] br\n[3] e5\n[4] rp\n[5] ml');
  assert.match(branchReplay.scriptErrors.find((error) => error.line === 4).error, /main line/i);

  const mindReplay = worldFrom('[1] e4\n[2] mind\n[3] rp');
  assert.match(mindReplay.scriptErrors.find((error) => error.line === 3).error, /requires reveal/i);
});

test('a replay at the tail extends playback', async () => {
  const replayAtTail = worldFrom('[1] e4\n[2] e5\n[29] rp');
  assert.equal(replayAtTail.visualEndTime, 30);
  assert.equal(playbackDuration(replayAtTail.visualEndTime), 33);
  assert.equal(playbackDuration(6), 30, 'the editor still keeps a scrubbable minimum');
});

test('replays share one template prefix as the main line grows', async () => {
  // Each materialized frame still keeps its own clock and capture id.
  const growingReplay = worldFrom('[1] e4\n[2] rp\n[3] e5\n[4] rp');
  assert.deepEqual(growingReplay.scriptErrors, []);
  assert.equal(growingReplay.replayFrames.length, 2);
  assert.equal(growingReplay.replaySequences.get(1).moveCount, 1);
  assert.equal(growingReplay.replaySequences.get(3).moveCount, 2);
  assert.equal(worldFrameAt(growingReplay, 1, 2.4).snapshot.chessState.turn, 'b');
  const firstVisit = worldFrameAt(growingReplay, 3, 4.2);
  const secondVisit = worldFrameAt(growingReplay, 3, 4.7);
  assert.strictEqual(worldFrameAt(growingReplay, 3, 4.8), secondVisit);
  assert.deepEqual(worldFrameAt(growingReplay, 3, 4.2), firstVisit);
});

test('replay frames reuse authored state with retimed clocks', async () => {
  for (const [fen, moves] of [
    [Chess.STARTING_FEN, ['e4', 'd5', 'exd5', 'Qxd5']],
    ['4k3/8/8/8/8/8/8/4K2R w K - 0 1', ['O-O']],
    ['7k/P7/8/8/8/8/8/7K w - - 0 1', ['a8=Q+']],
    ['7k/8/8/3pP3/8/8/8/7K w - d6 0 1', ['exd6']],
  ]) {
    const lines = moves.map((move, i) => `[${i + 1}] ${move}`);
    const build = buildWorld(parseScript([...lines, '[10] rp 0.8', '[20] rp'].join('\n')), setupFromFen(fen));
    assert.deepEqual(build.scriptErrors, []);
    for (let i = 0; i < moves.length; i++) {
      const authored = build.snapshots[i + 1];
      const frame = worldFrameAt(build, moves.length, 10 + (i * 8) / 10 + 0.1).snapshot;
      assert.strictEqual(frame.chessState, authored.chessState, 'replay reuses validated chess state');
      assert.equal(frame.check?.sq, authored.check?.sq);
      assert.equal(frame.lastMove.t, 10 + (i * 8) / 10);
      for (const [id, piece] of Object.entries(authored.positions)) {
        const replayed = frame.positions[id];
        for (const key of ['f', 'r', 'type', 'side', 'captured', 'moveFromF', 'moveFromR']) {
          assert.equal(replayed[key], piece[key], `replay preserves ${key}`);
        }
        if (piece.moveT != null) assert.equal(replayed.moveT, 10 + ((piece.moveT - 1) * 8) / 10);
        if (piece.captured) assert.equal(replayed.capturedAt, 10 + ((piece.capturedAt - 1) * 8) / 10);
        assert.equal(replayed.restoredAt, undefined);
      }
      if (authored.lastCapture) {
        assert.equal(frame.lastCapture.t, 10 + ((authored.lastCapture.t - 1) * 8) / 10);
        const repeated = worldFrameAt(build, moves.length + 1, 20 + i * 0.5 + 0.1).snapshot;
        assert.notEqual(frame.lastCapture.id, repeated.lastCapture.id);
      }
    }
  }
});

test('a hundred replays keep a hundred templates', async () => {
  const longMainline = Array.from({ length: 100 }, (_, i) => `[${i + 1}] ${['Nf3', 'Nf6', 'Ng1', 'Ng8'][i % 4]}`);
  const repeatedReplayText = [
    ...longMainline,
    ...Array.from({ length: 100 }, (_, i) => `[${200 + i * 51}] rp`),
  ].join('\n');
  const repeatedReplay = worldFrom(repeatedReplayText);
  assert.deepEqual(repeatedReplay.scriptErrors, []);
  assert.equal(repeatedReplay.replayFrames.length, 100, '100 replays retain 100 shared templates, not 10,000 frames');
  assert.equal(repeatedReplay.replaySequences.size, 100);
  const withoutReplay = worldFrom(longMainline.join('\n'));
  assert.deepEqual(withoutReplay.replayFrames, [], 'ordinary scripts retain no unused replay templates');
  assert.deepEqual(withoutReplay.snapshots, repeatedReplay.snapshots.slice(0, 101));
  for (const [eventIndex, sequence] of repeatedReplay.replaySequences) {
    assert.strictEqual(
      repeatedReplay.snapshots[eventIndex + 1].chessState,
      repeatedReplay.replayFrames[sequence.moveCount - 1].state.chessState,
      'each replay settles on its last shared template',
    );
    assert.equal(sequence.moveCount, 100);
  }
});
