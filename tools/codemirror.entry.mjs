// What Workshop takes from CodeMirror 6 for the text boxes of the
// design mode (ADR-0003). `npm run vendor` builds this into one file,
// pages/vendor/codemirror.js, and only pages/text.js reads that file.

export { EditorState } from '@codemirror/state';
export { Decoration, EditorView, ViewPlugin, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
export { autocompletion, startCompletion } from '@codemirror/autocomplete';
export { defaultKeymap, history, historyKeymap, isolateHistory, undo } from '@codemirror/commands';
export { HighlightStyle, bracketMatching, ensureSyntaxTree, indentOnInput, syntaxHighlighting } from '@codemirror/language';
export { search, searchKeymap } from '@codemirror/search';
export { setDiagnostics } from '@codemirror/lint';
export { json } from '@codemirror/lang-json';
export { tags } from '@lezer/highlight';
