import { Fragment } from 'react';
import { SYNTAX_GROUPS } from '../lib/commands';

// The Text view's syntax line. Grouped in `src/lib/commands.ts` (catalogue
// knowledge), rendered here, and built once at module scope: it closes over
// nothing, and the panel it sits in re-renders on every animation frame.
//
// Its own module rather than a local in `App.tsx` so the suite can load it.
// Coverage of the twelve kinds is structural — SYNTAX_GROUPS is derived from
// COMMANDS, so the hint cannot name ten of them again — but the *rendering* is
// not: `group.join(' / ')` written as `group[0]` drops `ml` and `reveal`
// silently, and that is the same hole one layer down. Asserting the string a
// reader actually sees needs the element to be importable.
//
// Every group is one nowrap span. A pair must not orphan its second half — a
// wrapped `reveal` reads as a separate command — and the single-token groups
// need it just as much: the arrow entry (`f3->e5`) is the one with an internal
// break opportunity, and it breaks after the hyphen into `f3-` / `>e5`.
export const SYNTAX_HINT = (
  <p className="panel-hint">
    [mm:ss.s]{' '}
    {SYNTAX_GROUPS.map((group, i) => (
      <Fragment key={group[0]}>
        {i > 0 && ' · '}
        <span className="nowrap">{group.join(' / ')}</span>
      </Fragment>
    ))}
  </p>
);
