import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { KINDS } from '../model/kinds';
import { LENGTH_WORDS } from '../model/sizes';
import type { Stretch } from '../model/types';

interface NameBlockProps {
  stretch: Stretch | null;
  onRename: (name: string) => void;
}

/** The stretch's name in bold with its kind and length in words beneath. A tap on the name lets you type over it. */
export function NameBlock({ stretch, onRename }: NameBlockProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const open = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  if (!stretch) return null;

  const begin = () => {
    setName(stretch.name);
    open.current = true;
    setEditing(true);
  };

  const close = () => {
    open.current = false;
    setEditing(false);
  };

  const commit = () => {
    if (!open.current) return;
    const trimmed = name.trim();
    if (trimmed && trimmed !== stretch.name) onRename(trimmed);
    close();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      close();
    }
  };

  return (
    <div className="hud-name">
      <h1>
        {editing ? (
          <input
            ref={input}
            type="text"
            aria-label="Stretch name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
            autoComplete="off"
            enterKeyHint="done"
          />
        ) : (
          <button type="button" className="name-button" aria-label={`${stretch.name}. Tap to rename.`} onClick={begin}>
            {stretch.name}
          </button>
        )}
      </h1>
      <p>
        {KINDS[stretch.kind].word}, {LENGTH_WORDS[stretch.length]}
      </p>
    </div>
  );
}
