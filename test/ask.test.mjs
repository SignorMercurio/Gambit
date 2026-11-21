// The `ask` question card: parsing, the live-card rule, and its rendering.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { load, worldFrom } from './support.mjs';

const { activeAskAt, parseScript } = await load('/src/lib/timeline.ts');
const { ASK_MAX_SECONDS } = await load('/src/lib/commands.ts');
const { AskCard } = await load('/src/components/AskCard.tsx');

// Seconds first, so a question may itself start with a number.
const [ask] = parseScript('[1:13.9] ask 3 怎样让黑方走不出 Bh5？');

test('ask takes whole seconds first, then free text', async () => {
  assert.equal(ask.kind, 'ask');
  assert.equal(ask.seconds, 3);
  assert.equal(ask.text, '怎样让黑方走不出 Bh5？');
  assert.equal(parseScript('[1] ask 3 3 步之内怎么杀？')[0].text, '3 步之内怎么杀？');
  assert.equal(parseScript(`[1] ASK ${ASK_MAX_SECONDS} Why?`)[0].seconds, ASK_MAX_SECONDS);
});

test('a malformed ask names ask rather than falling through to SAN', async () => {
  for (const bad of ['ask', 'ask 3', 'ask Why?', 'ask 3s Why?']) {
    assert.match(parseScript(`[1] ${bad}`)[0].error ?? '', /ask needs seconds and a question/i, bad);
  }
  for (const bad of ['ask 0 Why?', `ask ${ASK_MAX_SECONDS + 1} Why?`]) {
    assert.match(parseScript(`[1] ${bad}`)[0].error ?? '', /ask countdown must be/i, bad);
  }
});

test('the live card is the same whether looked up over asks or all events', async () => {
  // So the per-frame lookup can skip the moves.
  {
    const withMoves = parseScript('[1] ask 3 Which move?\n[2] e4\n[3] e5\n[10] ask 2 And now?\n[11] Nf3');
    const asksOnly = withMoves.filter((e) => e.kind === 'ask');
    for (const t of [0, 1, 3.9, 4, 10, 11.5, 12]) {
      assert.equal(activeAskAt(asksOnly, t), activeAskAt(withMoves, t), `t=${t}`);
    }
  }
});

test('a later ask replaces the card and nothing else ends it', async () => {
  // Replaced, not stacked, even by an ask that ends while the earlier window
  // would still be open.
  const askEvents = parseScript('[10] ask 5 First?\n[11] e4\n[12] ask 1 Second?\n[20] ask 2 Third?');
  assert.equal(activeAskAt(askEvents, 9.9), null);
  assert.equal(activeAskAt(askEvents, 10)?.text, 'First?');
  assert.equal(activeAskAt(askEvents, 11.5)?.text, 'First?', 'other events do not end the card');
  assert.equal(activeAskAt(askEvents, 12.5)?.text, 'Second?');
  assert.equal(activeAskAt(askEvents, 13.5), null, 'an expired later ask does not revive the earlier one');
  assert.equal(activeAskAt(askEvents, 21.99)?.text, 'Third?');
  assert.equal(activeAskAt(askEvents, 22), null);
});

test('a countdown that outlasts the script holds the playback tail', async () => {
  assert.equal(worldFrom('[1] e4\n[2] ask 30 Why?').visualEndTime, 32);
  assert.equal(worldFrom('[1] ask 1 Why?\n[5] e4').visualEndTime, 5);
});

test('the card shows whole seconds left and the spent share of the ring', async () => {
  const askCardAt = (time) => renderToStaticMarkup(createElement(AskCard, { ask, time }));
  const digitAt = (time) => askCardAt(time).match(/class="ask-digit">(\d+)</)?.[1];
  assert.equal(digitAt(ask.t), '3');
  assert.equal(digitAt(ask.t + 0.01), '3');
  assert.equal(digitAt(ask.t + 1), '2');
  assert.equal(digitAt(ask.t + 2.99), '1');
  assert.match(askCardAt(ask.t + 1.5), /stroke-dashoffset="50"/);
  assert.match(askCardAt(ask.t), /aria-hidden="true"/, 'the countdown stays out of the live region');
});
