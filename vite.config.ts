import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Relative base so the build also works from a sub-path (e.g. GitHub Pages).
  base: './',
  test: { environment: 'node' },
})
