import { expect, test, vi } from 'vitest';
import { buzz } from './haptics';

test('buzz asks the phone for one short vibration, and survives a phone without one', () => {
  const vibrate = vi.fn();
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
  buzz();
  expect(vibrate).toHaveBeenCalledWith(30);

  Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true });
  expect(() => buzz()).not.toThrow();
});
