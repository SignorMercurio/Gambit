// The question card an `ask` line puts in the subtitle track. It is part of
// the recording, so everything on it derives from the event and the clock:
// the digit is the whole seconds left, the ring is the unspent fraction, and
// no timer or transition state exists to drift from the playhead.
//
// It sits in the subtitle strip rather than over the board because the viewer
// is meant to look at the position while thinking, and a thinking pause is
// exactly when narration — and so the cue — is silent. The strip's height is
// reserved already, so the card appears without shifting layout.

import type { ParsedEvent } from '../lib/timeline';

export function AskCard({
  ask,
  time,
}: {
  ask: Extract<ParsedEvent, { kind: 'ask' }>;
  time: number;
}) {
  // `activeAskAt` only hands over a live card, so t <= time < t + seconds.
  const elapsed = time - ask.t;
  return (
    <div className="ask-card">
      {/* The digit changes every second; hidden so the live region announces
          the question once, not a countdown. */}
      <span className="ask-countdown" aria-hidden="true">
        {/* pathLength=100 makes the dash offset the spent percentage directly,
            whatever the radius. */}
        <svg viewBox="0 0 40 40" className="ask-ring">
          <circle className="ask-ring-track" cx="20" cy="20" r="16" pathLength={100} />
          <circle
            className="ask-ring-left"
            cx="20"
            cy="20"
            r="16"
            pathLength={100}
            strokeDasharray="100 100"
            strokeDashoffset={(elapsed / ask.seconds) * 100}
          />
        </svg>
        <span className="ask-digit">{Math.ceil(ask.seconds - elapsed)}</span>
      </span>
      <p>{ask.text}</p>
    </div>
  );
}
