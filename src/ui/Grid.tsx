import type { Camera } from '../plane/camera';
import { gridFor } from '../plane/grid';

interface GridProps {
  camera: Camera;
}

/** Wraps a position into [0, size), so the line through the world's origin stays on the grid. */
const wrap = (v: number, size: number) => ((v % size) + size) % size;

/**
 * The time grid, under everything in the world layer. One square is one unit of the ladder,
 * drawn as hairlines in the paper's own grey; the squares are a repeated background, so the
 * grid costs the same however far out the camera is.
 */
export function Grid({ camera }: GridProps) {
  const { px } = gridFor(camera.scale);
  return (
    <div
      className="grid"
      aria-hidden="true"
      style={{
        backgroundSize: `${px}px ${px}px`,
        backgroundPosition: `${wrap(camera.x, px)}px ${wrap(camera.y, px)}px`,
      }}
    />
  );
}
