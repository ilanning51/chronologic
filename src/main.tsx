import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import { createStore } from './store/store';
import { App } from './ui/App';

const store = createStore({ tracks: [], stops: [], lastTouched: null });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
);
