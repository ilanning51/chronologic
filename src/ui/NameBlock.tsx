import { KINDS } from '../model/kinds';
import { LENGTH_WORDS } from '../model/sizes';
import type { Stretch } from '../model/types';

/** The stretch's name in bold with its kind and length in words beneath. Empty with no stretch. */
export function NameBlock({ stretch }: { stretch: Stretch | null }) {
  if (!stretch) return null;
  return (
    <div className="hud-name">
      <h1>{stretch.name}</h1>
      <p>
        {KINDS[stretch.kind].word}, {LENGTH_WORDS[stretch.length]}
      </p>
    </div>
  );
}
