import { build } from 'esbuild';

await build({
  entryPoints: ['src/frontend.js'],
  bundle: true,
  outfile: 'static/app/main.js',
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  legalComments: 'none',
});
