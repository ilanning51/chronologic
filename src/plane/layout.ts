import { nextIndex, trainState, trackRoute } from '../model/train';
import type { Shape, Size, Stop, Track } from '../model/types';
import { type Camera, worldToScreen } from './camera';
import { CLIP_MARGIN_PX, clipSegment } from './clip';
import type { Point } from './geometry';
import { labelsWithRoom } from './labels';

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
  segments: [Point, Point][];
  stops: StopView[];
  train: TrainView;
  anyInView: boolean;
}

/**
 * Turns a track, the camera and the clock into screen pixels, ready to paint. Only the
 * positions scale with zoom. Segments are cut to the viewport plus a margin and stops
 * outside it are left out, so a month of track at full zoom never reaches the renderer.
 */
export function layoutTrack(
  track: Track,
  byId: Map<string, Stop>,
  camera: Camera,
  now: number,
  viewport: { w: number; h: number },
): TrackView {
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

  const next = nextIndex(track);
  const goalIndex = track.stops.length - 1;
  const placed = track.stops.flatMap((id, index) => {
    const stop = byId.get(id)!;
    const at = worldToScreen(camera, stop);
    return inside(at) ? [{ stop, at, index }] : [];
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
  }));

  const state = trainState(track, byId, now);
  const trainAt = worldToScreen(camera, state.at);
  const train: TrainView = { x: trainAt.x, y: trainAt.y, angle: state.angle, waiting: state.waiting, parked: state.parked };

  return {
    id: track.id,
    color: track.color,
    finished: state.parked,
    segments,
    stops,
    train,
    anyInView: segments.length > 0 || stops.length > 0 || inside(trainAt),
  };
}
