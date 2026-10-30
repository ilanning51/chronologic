import { SPLIT_PIECES, slideToFront } from './slide';
import { defaultName } from './stretch';
import type { Kind, Length, Shape, Station, World } from './types';

/** World units between the circles a station splits into. */
const SPLIT_GAP = 48;

export type Action =
  | { type: 'add'; id: string; title: string; shape: Shape; x: number; y: number }
  | { type: 'move'; id: string; x: number; y: number }
  | { type: 'edit'; id: string; title?: string; shape?: Shape }
  | { type: 'split'; id: string; ids: string[] }
  | { type: 'delete'; id: string }
  | { type: 'start'; kind: Kind; length: Length; line: string[]; now: number; hour: number }
  | { type: 'redraw'; kind: Kind; line: string[] }
  | { type: 'complete'; id: string }
  | { type: 'restore'; id: string }
  | { type: 'rename'; name: string }
  | { type: 'end' };

export const EMPTY: World = { stations: [], stretch: null, lastLength: 'couple' };

/** A line holds each station once, and only stations that exist. */
function cleanLine(line: string[], stations: Station[]): string[] {
  const known = new Set(stations.map((s) => s.id));
  const out: string[] = [];
  for (const id of line) {
    if (known.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

function patch(world: World, id: string, change: Partial<Station>): World {
  if (!world.stations.some((s) => s.id === id)) return world;
  return { ...world, stations: world.stations.map((s) => (s.id === id ? { ...s, ...change } : s)) };
}

export function reduce(world: World, action: Action): World {
  switch (action.type) {
    case 'add': {
      const station: Station = { id: action.id, title: action.title, shape: action.shape, x: action.x, y: action.y, z: 0, done: false };
      return { ...world, stations: [...world.stations, station] };
    }

    case 'move':
      return patch(world, action.id, { x: action.x, y: action.y });

    case 'edit': {
      const change: Partial<Station> = {};
      if (action.title !== undefined) change.title = action.title;
      if (action.shape !== undefined) change.shape = action.shape;
      return patch(world, action.id, change);
    }

    case 'split': {
      const original = world.stations.find((s) => s.id === action.id);
      if (!original || action.ids.length !== SPLIT_PIECES[original.shape]) return world;
      const pieces: Station[] = action.ids.map((id, i) => ({
        id,
        title: `${original.title} ${i + 1}`,
        shape: 'circle',
        x: original.x + SPLIT_GAP * i,
        y: original.y,
        z: 0,
        done: false,
      }));
      const stations = world.stations.flatMap((s) => (s.id === action.id ? pieces : [s]));
      const stretch = world.stretch
        ? { ...world.stretch, line: world.stretch.line.flatMap((id) => (id === action.id ? action.ids : [id])) }
        : null;
      return { ...world, stations, stretch };
    }

    case 'delete': {
      if (!world.stations.some((s) => s.id === action.id)) return world;
      const stations = world.stations.filter((s) => s.id !== action.id);
      const stretch = world.stretch ? { ...world.stretch, line: world.stretch.line.filter((id) => id !== action.id) } : null;
      return { ...world, stations, stretch };
    }

    case 'start': {
      if (world.stretch) return world;
      const line = cleanLine(action.line, world.stations);
      if (line.length === 0) return world;
      return {
        ...world,
        stretch: { kind: action.kind, length: action.length, name: defaultName(action.hour), startedAt: action.now, line },
        lastLength: action.length,
      };
    }

    case 'redraw': {
      if (!world.stretch) return world;
      const line = cleanLine(action.line, world.stations);
      if (line.length === 0) return world;
      return { ...world, stretch: { ...world.stretch, kind: action.kind, line } };
    }

    case 'complete': {
      if (!world.stretch || !world.stretch.line.includes(action.id)) return world;
      const next = patch(world, action.id, { done: true });
      const line = next.stretch!.line;
      const allDone = line.every((id) => next.stations.find((s) => s.id === id)?.done);
      return allDone ? { ...next, stretch: null } : next;
    }

    case 'restore':
      return patch(world, action.id, { done: false });

    case 'rename':
      if (!world.stretch) return world;
      return { ...world, stretch: { ...world.stretch, name: action.name } };

    case 'end': {
      if (!world.stretch) return world;
      const pending = world.stretch.line.filter((id) => !world.stations.find((s) => s.id === id)?.done);
      return { ...world, stations: slideToFront(world.stations, pending), stretch: null };
    }
  }
}
