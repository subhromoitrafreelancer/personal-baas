// Entry point bundled by build-vendor.mjs into a single browser ESM file. The admin UI's own
// pages load that bundle with a plain <script type="module">; only this third-party editor
// dependency is pre-bundled — everything else stays unbundled vanilla JS.
export { EditorView, basicSetup } from 'codemirror';
export { EditorState } from '@codemirror/state';
export { sql, PostgreSQL } from '@codemirror/lang-sql';
export { indentWithTab } from '@codemirror/commands';
export { keymap } from '@codemirror/view';
