import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // Real stylesheet text, so tests can read the rules that jsdom cannot lay out.
    css: { include: [/styles\/.*\.css/] },
    setupFiles: ['src/test-setup.ts'],
  },
});
