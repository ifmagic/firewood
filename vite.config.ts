import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // vitest config — `npm test` to run. Frontend unit tests live next to source.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
