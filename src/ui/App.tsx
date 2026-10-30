import { useCallback, useState } from 'react';
import '../styles/ui.css';
import { kindVar } from '../model/kinds';
import { remaining } from '../model/stretch';
import { type Camera, HOME, panBy, zoomAt } from '../plane/camera';
import type { Point } from '../plane/geometry';
import type { Gesture } from '../plane/gestures';
import { type Store, useWorld } from '../store/store';
import { Hud } from './Hud';
import { Plane } from './Plane';
import { Station } from './Station';

export interface AppProps {
  store: Store;
  /** The clock the app reads, injectable for tests. */
  now?: () => number;
}

export function App({ store, now = Date.now }: AppProps) {
  const world = useWorld(store);
  const [camera, setCamera] = useState<Camera>(HOME);

  const onGesture = useCallback((g: Gesture) => {
    if (g.type === 'pan') {
      setCamera((c) => panBy(c, g.dx, g.dy));
    } else if (g.type === 'pinch') {
      setCamera((c) => panBy(zoomAt(c, g.center, g.factor), g.dx, g.dy));
    }
  }, []);

  const onZoom = useCallback((at: Point, factor: number) => setCamera((c) => zoomAt(c, at, factor)), []);

  const stretch = world.stretch;
  const lineColor = kindVar(stretch ? stretch.kind : 'deep');
  const fraction = stretch ? remaining(stretch, now()) : 0;
  const nextId = stretch ? (stretch.line.find((id) => !world.stations.find((s) => s.id === id)?.done) ?? null) : null;

  return (
    <Plane
      camera={camera}
      lineColor={lineColor}
      onGesture={onGesture}
      onZoom={onZoom}
      hud={<Hud stretch={stretch} fraction={fraction} lineColor={lineColor} />}
    >
      {world.stations.map((s) => (
        <Station key={s.id} station={s} scale={camera.scale} next={s.id === nextId} />
      ))}
    </Plane>
  );
}
