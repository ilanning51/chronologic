import type { Shape, Station, Stretch } from '../model/types';
import { Bullets } from './Bullets';
import { CaptureField } from './CaptureField';
import { Clock } from './Clock';
import { NameBlock } from './NameBlock';
import { StationEditor } from './StationEditor';

interface HudProps {
  stretch: Stretch | null;
  /** The fraction of the running stretch still to come. */
  fraction: number;
  lineColor: string;
  onAdd: (title: string, shape: Shape) => void;
  /** The station open for editing after a long press, if any. */
  editing: Station | null;
  onEdit: (change: { title?: string; shape?: Shape }) => void;
  onSplit: () => void;
  onDelete: () => void;
  onCloseEditor: () => void;
}

/** Four stickers on the glass, one per corner. Nothing else is ever pinned to the screen. */
export function Hud({ stretch, fraction, lineColor, onAdd, editing, onEdit, onSplit, onDelete, onCloseEditor }: HudProps) {
  return (
    <div className="hud" data-target="hud">
      <NameBlock stretch={stretch} />
      {stretch && <Clock fraction={fraction} color={lineColor} />}
      <Bullets />
      {editing && (
        <StationEditor
          key={editing.id}
          station={editing}
          onEdit={onEdit}
          onSplit={onSplit}
          onDelete={onDelete}
          onClose={onCloseEditor}
        />
      )}
      <CaptureField onAdd={onAdd} />
    </div>
  );
}
