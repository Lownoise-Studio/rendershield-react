import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true, // Allows using 'describe', 'it', etc. without manual imports if preferred
  },
});