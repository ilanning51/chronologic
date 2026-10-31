import '../styles/ui.css';
import type { Store } from '../store/store';

export interface AppProps {
  store: Store;
  /** The clock the app reads, injectable for tests. */
  now?: () => number;
}

/** The v2 plane arrives piece by piece; for now it is bare paper. */
export function App(_props: AppProps) {
  return <main className="plane" aria-label="The plane" />;
}
