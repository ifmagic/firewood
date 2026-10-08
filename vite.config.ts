import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // vitest config — `npm test` to run. Frontend unit tests live next to source.
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    // Worker threads instead of the default forks: same per-file isolation,
    // measurably faster suite (~4.6-5.0s vs ~5.9-6.4s locally). vmThreads
    // would shrink jsdom setup further but breaks on @ant-design/colors
    // ("Cannot use import statement outside a module") — do not switch.
    pool: 'threads',
  },
});
