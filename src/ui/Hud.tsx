import type { Kind, Length, Shape, Station, Stretch } from '../model/types';
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
  /** Whether a finger is holding the clock. */
  holding: boolean;
  onFlyToTrain: () => void;
  onRename: (name: string) => void;
  /** The bullet last tapped, whose length chips are showing. */
  pendingKind: Kind | null;
  /** The length the next stretch will get. */
  length: Length;
  onPickKind: (kind: Kind) => void;
  onPickLength: (length: Length) => void;
  onAdd: (title: string, shape: Shape) => void;
  /** The station open for editing after a long press, if any. */
  editing: Station | null;
  onEdit: (change: { title?: string; shape?: Shape }) => void;
  onSplit: () => void;
  onDelete: () => void;
  onCloseEditor: () => void;
}

/** Four stickers on the glass, one per corner. Nothing else is ever pinned to the screen. */
export function Hud({
  stretch,
  fraction,
  lineColor,
  holding,
  onFlyToTrain,
  onRename,
  pendingKind,
  length,
  onPickKind,
  onPickLength,
  onAdd,
  editing,
  onEdit,
  onSplit,
  onDelete,
  onCloseEditor,
}: HudProps) {
  return (
    <div className="hud" data-target="hud">
      <NameBlock stretch={stretch} onRename={onRename} />
      {stretch && <Clock fraction={fraction} color={lineColor} holding={holding} onActivate={onFlyToTrain} />}
      <Bullets pendingKind={pendingKind} length={length} onPickKind={onPickKind} onPickLength={onPickLength} />
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
