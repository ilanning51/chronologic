import { useEffect, useState } from 'react';
import '../styles/ui.css';
import { HOME } from '../plane/camera';
import { layoutTrack } from '../plane/layout';
import { tickMsFor } from '../plane/tick';
import { type Store, useWorld } from '../store/store';
import { Plane } from './Plane';
import { Stop } from './Stop';
import { Track } from './Track';

export interface AppProps {
  store: Store;
  /** The clock the app reads, injectable for tests. */
  now?: () => number;
}

/** Gestures and zoom arrive with the camera work; until then the paper ignores them. */
const ignore = () => {};

/** The v2 plane: every track and stop in screen space, redrawn as the clock ticks. */
export function App({ store, now = Date.now }: AppProps) {
  const world = useWorld(store);
  const [camera] = useState(HOME);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [time, setTime] = useState(now);

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const byId = new Map(world.stops.map((s) => [s.id, s]));
  const views = world.tracks.map((t) => layoutTrack(t, byId, camera, time, viewport));
  const rolling = views.some((v) => !v.train.parked);

  useEffect(() => {
    if (!rolling) return;
    const id = window.setInterval(() => setTime(now()), tickMsFor(camera.scale));
    return () => window.clearInterval(id);
  }, [rolling, camera.scale, now]);

  return (
    <Plane onGesture={ignore} onZoom={ignore} hud={null}>
      {views.map((v) => (
        <Track key={v.id} view={v} />
      ))}
      {views.flatMap((v) => v.stops.map((s) => <Stop key={s.id} stop={s} track={v.id} color={v.color} />))}
    </Plane>
  );
}
