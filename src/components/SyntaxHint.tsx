import { Fragment } from 'react';
import { SYNTAX_GROUPS } from '../lib/commands';

// The Text view's syntax line, grouped by SYNTAX_GROUPS and built once at
// module scope. Its own module so test/commands.test.mjs can assert the
// rendered text (rendering `group[0]` would silently drop `ml` and `reveal`).
//
// Every group is one nowrap span: a pair must not orphan its second half, and
// `f3->e5` would otherwise break after the hyphen.
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
