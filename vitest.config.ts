import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist*/**',
      // Workspace packages have their own runners (node:test, their own vitest configs).
      'packages/**',
      // These suites assert upstream Voyager's CI/release setup and read those files at
      // module load, so they only run where that setup exists. Gate on the files they
      // read, not on `.github/workflows` itself: this repo has its own, different CI.
      ...(!fs.existsSync('.github/workflows/pr-gate.yml') ? ['scripts/pr-workflows.test.js'] : []),
      ...(!fs.existsSync('.github/workflows/release.yml') ||
      !fs.existsSync('.github/RELEASE_TEMPLATE.md')
        ? ['src/pages/popup/__tests__/releaseArtifacts.test.ts']
        : []),
      ...(!fs.existsSync('docs/public')
        ? [
            'src/core/services/__tests__/googleOAuthWebFlow.test.ts',
            'src/features/plugins/manifest/schema.test.ts',
          ]
        : []),
      ...(!fs.existsSync('.githooks') ? ['scripts/oxc-toolchain.test.js'] : []),
    ],
    // Vitest stubs CSS imports to '' unless the file is listed here, which
    // also swallows `?raw` imports. The bundled plugin catalog is plain CSS
    // read as text, so let Vite serve it for real; app CSS stays stubbed.
    css: { include: [/src\/features\/plugins\/catalog\/.*\.css(?:\?raw)?$/] },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/tests/', '**/*.d.ts', '**/*.config.*', '**/mockData.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@locales': path.resolve(__dirname, './src/locales'),
      '@/core': path.resolve(__dirname, './src/core'),
      '@/features': path.resolve(__dirname, './src/features'),
      'wavedrom/render-any': path.resolve(__dirname, './node_modules/wavedrom/lib/render-any.js'),
    },
  },
});
