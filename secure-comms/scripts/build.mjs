import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist/pkg', { recursive: true });
await build({ entryPoints: ['src/main.js'], bundle: true, outfile: 'dist/main.js', format: 'esm', platform: 'browser', target: ['es2022'], minify: true, sourcemap: false });
for (const file of ['index.html', 'style.css']) await copyFile(`src/${file}`, `dist/${file}`);
await copyFile('node_modules/@matrix-org/matrix-sdk-crypto-wasm/pkg/matrix_sdk_crypto_wasm_bg.wasm', 'dist/pkg/matrix_sdk_crypto_wasm_bg.wasm');
console.log('Built local encrypted communications UI.');
