import type { Camera } from '../plane/camera';
import { gridFor } from '../plane/grid';

interface LegendProps {
  camera: Camera;
}

/** A sticker in the bottom left: one grid square and how much time it stands for right now. */
export function Legend({ camera }: LegendProps) {
  const { label } = gridFor(camera.scale);
  return (
    <div className="legend" data-target="hud" role="note" aria-label={`One square is ${label}`}>
      <span aria-hidden="true" className="square" />
      <span aria-hidden="true">{label}</span>
    </div>
  );
}
