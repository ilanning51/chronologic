import { crowdAt } from '../model/crowd';
import { tracksOf } from '../model/reducer';
import { nextIndex, stateOf, trackRoute } from '../model/train';
import type { Shape, Size, Track, World } from '../model/types';
import { type Camera, worldToScreen } from './camera';
import { CLIP_MARGIN_PX, clipSegment } from './clip';
import type { Point } from './geometry';
import { gridFor } from './grid';
import { labelsWithRoom } from './labels';
import { showsAt } from './level';

export interface StopView {
  id: string;
  x: number;
  y: number;
  shape: Shape;
  size: Size;
  done: boolean;
  title: string;
  label: boolean;
  next: boolean;
  goal: boolean;
  /** On two or more lines and not done: an interchange, drawn as a ring. */
  ring: boolean;
  /** Dots of crowd, only on the stop the train waits at. */
  crowd: number;
}

export interface TrainView {
  x: number;
  y: number;
  angle: number;
  waiting: boolean;
  parked: boolean;
}

export interface TrackView {
  id: string;
  color: number;
  finished: boolean;
  /** The day line, drawn in ink. */
  day: boolean;
  /** A project line with only its goal, drawn muted and thin. A look, not a state. */
  sketch: boolean;
  segments: [Point, Point][];
  stops: StopView[];
  train: TrainView;
  anyInView: boolean;
}

/**
 * Turns a track, the camera and the clock into screen pixels, ready to paint. Only the
 * positions scale with zoom. Segments are cut to the viewport plus a margin and stops
 * outside it are left out, so a month of track at full zoom never reaches the renderer.
 * Stops below the grid's level are left out too, as a map leaves out streets from far away,
 * except the next stop, the goal and any id in `keep`; the line still routes through them.
 */
export function layoutTrack(
  track: Track,
  world: World,
  camera: Camera,
  now: number,
  viewport: { w: number; h: number },
  keep: Set<string> = new Set(),
): TrackView {
  const byId = new Map(world.stops.map((s) => [s.id, s]));
  const grown = {
    x: -CLIP_MARGIN_PX,
    y: -CLIP_MARGIN_PX,
    w: viewport.w + 2 * CLIP_MARGIN_PX,
    h: viewport.h + 2 * CLIP_MARGIN_PX,
  };
  const inside = (p: Point) => p.x >= grown.x && p.x <= grown.x + grown.w && p.y >= grown.y && p.y <= grown.y + grown.h;

  const vertices = trackRoute(track, byId).vertices.map((v) => worldToScreen(camera, v));
  const segments: [Point, Point][] = [];
  for (let i = 1; i < vertices.length; i++) {
    const clipped = clipSegment(vertices[i - 1], vertices[i], grown);
    if (clipped) segments.push(clipped);
  }

  const state = stateOf(track, world, now);
  const crowd = state.waiting ? crowdAt(track, byId, now) : 0;

  const next = nextIndex(track, byId);
  const goalIndex = track.stops.length - 1;
  const gridSeconds = gridFor(camera.scale).seconds;
  const placed = track.stops.flatMap((id, index) => {
    const stop = byId.get(id)!;
    const at = worldToScreen(camera, stop);
    const shown = index === next || index === goalIndex || keep.has(id) || showsAt(stop.shape, stop.size, gridSeconds);
    return inside(at) && shown ? [{ stop, at, index }] : [];
  });
  const always = new Set<string>();
  for (const p of placed) {
    if (p.index === goalIndex || p.index === next) always.add(p.stop.id);
  }
  const labeled = labelsWithRoom(placed.map((p) => ({ id: p.stop.id, x: p.at.x })), always);
  const stops: StopView[] = placed.map(({ stop, at, index }) => ({
    id: stop.id,
    x: at.x,
    y: at.y,
    shape: stop.shape,
    size: stop.size,
    done: stop.done,
    title: stop.title,
    label: labeled.has(stop.id),
    next: index === next,
    goal: index === goalIndex,
    ring: !stop.done && tracksOf(world, stop.id).length >= 2,
    crowd: index === state.leg ? crowd : 0,
  }));

  const trainAt = worldToScreen(camera, state.at);
  const train: TrainView = { x: trainAt.x, y: trainAt.y, angle: state.angle, waiting: state.waiting, parked: state.parked };

  return {
    id: track.id,
    color: track.color,
    finished: state.parked,
    day: track.day !== undefined,
    sketch: !track.day && track.stops.length === 1,
    segments,
    stops,
    train,
    anyInView: segments.length > 0 || stops.length > 0 || inside(trainAt),
  };
}
