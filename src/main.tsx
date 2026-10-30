import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import { load } from './store/storage';
import { createStore, persist } from './store/store';
import { App } from './ui/App';

const store = createStore(load(localStorage));
persist(store, localStorage);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
);
