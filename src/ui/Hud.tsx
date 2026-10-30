import type { Shape, Stretch } from '../model/types';
import { Bullets } from './Bullets';
import { CaptureField } from './CaptureField';
import { Clock } from './Clock';
import { NameBlock } from './NameBlock';

interface HudProps {
  stretch: Stretch | null;
  /** The fraction of the running stretch still to come. */
  fraction: number;
  lineColor: string;
  onAdd: (title: string, shape: Shape) => void;
}

/** Four stickers on the glass, one per corner. Nothing else is ever pinned to the screen. */
export function Hud({ stretch, fraction, lineColor, onAdd }: HudProps) {
  return (
    <div className="hud" data-target="hud">
      <NameBlock stretch={stretch} />
      {stretch && <Clock fraction={fraction} color={lineColor} />}
      <Bullets />
      <CaptureField onAdd={onAdd} />
    </div>
  );
}
