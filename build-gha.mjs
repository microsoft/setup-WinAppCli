// Builds the GitHub Action bundle (dist/index.mjs) with esbuild as ESM.
//
// The @actions/* toolkit is ESM-only, but it (and its transitive deps such as
// tunnel/undici) still contain CommonJS modules that call require() on Node
// built-ins. esbuild's ESM output does not provide a require() by default, so we
// inject one via createRequire in the banner. Using a script (instead of a CLI
// flag) avoids brittle cross-platform shell quoting of the banner.
import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  outfile: 'dist/index.mjs',
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'module'",
      'const require = __createRequire(import.meta.url)'
    ].join('\n')
  }
})
