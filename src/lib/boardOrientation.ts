import { idxToSq, sqToIdx } from './chess';

export type BoardOrientation = 'white' | 'black';

export type BoardViewPosition = { x: number; y: number };

// Chess coordinates stay canonical throughout the app. This is the only
// transform between that model and the board's top-left screen origin, so
// every rendered layer and pointer gesture agrees when the view is flipped.
export function boardViewPosition(
  f: number,
  r: number,
  orientation: BoardOrientation,
): BoardViewPosition {
  return orientation === 'white' ? { x: f, y: 7 - r } : { x: 7 - f, y: r };
}

export function squareFromBoardView(
  x: number,
  y: number,
  orientation: BoardOrientation,
): string {
  return orientation === 'white' ? idxToSq(x, 7 - y) : idxToSq(7 - x, y);
}

// Same transform, entered from a square name. Every rendered layer holds
// squares as strings (`hl e4`, `check.sq`, a gesture's origin) and had to
// destructure `sqToIdx` itself just to call `boardViewPosition` — one site
// called it twice in a single expression to fill both arguments. Named as the
// inverse of `squareFromBoardView` so the module's two directions read as a
// pair.
export function squareViewPosition(
  sq: string,
  orientation: BoardOrientation,
): BoardViewPosition {
  const { f, r } = sqToIdx(sq);
  return boardViewPosition(f, r, orientation);
}
