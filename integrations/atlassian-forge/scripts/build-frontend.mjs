import { build } from 'esbuild';

await build({
  entryPoints: ['src/workflow-frontend.js'],
  bundle: true,
  outfile: 'static/app/main.js',
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  legalComments: 'none',
  loader: { '.html': 'text' },
});

await build({ entryPoints: ['src/frontline-standalone.js'], bundle: true, outfile: 'static/app/frontline.js', platform: 'browser', format: 'esm', target: 'es2022', legalComments: 'none' });
