import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [path.join(__dirname, 'vendor-entry.js')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  sourcemap: true,
  outfile: path.join(__dirname, '../src/admin-ui/public/js/vendor/codemirror.bundle.js'),
});

console.log('Vendored CodeMirror bundle written to admin-ui/public/js/vendor/codemirror.bundle.js');
